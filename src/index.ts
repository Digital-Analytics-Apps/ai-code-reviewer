import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "octokit";
import OpenAI from "openai";
import parseDiff from "parse-diff";

import { getGuidelines } from "./guidelines/guidelines.js";
import {
  ReviewArraySchema,
  GithubReviewComment,
} from "./schemas/review.schema.js";
import { AIService } from "./services/ai.service.js";
import { GithubService } from "./services/github.service.js";
import {
  buildDiffContent,
  buildReviewPrompt,
  getValidLines,
  isIgnoredFile,
} from "./utils/diff.utils.js";

// ==========================================
// ORQUESTRADOR PRINCIPAL
// ==========================================

/**
 * Função principal da Action. Coordena todos os serviços e utilitários
 * para executar o fluxo completo de revisão de código por IA.
 *
 * Fluxo:
 * 1. Lê os inputs do workflow
 * 2. Valida o contexto (PR ou comentário /ai-review)
 * 3. Inicializa os serviços (GitHub + IA)
 * 4. Busca o diff do PR
 * 5. Processa cada chunk de cada arquivo em paralelo controlado
 * 6. Posta os comentários de revisão em lotes no GitHub
 */
async function run(): Promise<void> {
  try {
    // ── [1] INPUTS ──────────────────────────────────────────────────────────
    // core.getInput() é a forma que Actions lê os valores do bloco "with:" no YAML
    const githubToken = core.getInput("github_token", { required: true });
    const aiKey = core.getInput("ai_api_key", { required: true });
    const aiBaseUrl = core.getInput("ai_base_url") || undefined;
    const aiModel = core.getInput("ai_model") || "gpt-4o-mini";
    const customRulesInput = core.getInput("custom_rules") || "";
    const rulesPathInput = core.getInput("rules_path") || "";

    // [SAFETY] Informa ao GitHub para censurar a Key nos logs = ***
    core.setSecret(aiKey);

    // ── [2] CONTEXTO DO EVENTO ───────────────────────────────────────────────
    // Extrai os dados do PR ou Repo onde a Action está rodando no momento
    const context = github.context;
    const { owner, repo } = context.repo;

    // Lida com re-avaliação sob demanda via Comentário ("/ai-review")
    if (context.eventName === "issue_comment") {
      const commentBody = context.payload.comment?.body || "";

      if (!commentBody.trim().startsWith("/ai-review")) {
        core.info(
          "ℹ️ Comment does not start with '/ai-review' command. Silently ignoring.",
        );
        return;
      }

      if (!context.payload.issue?.pull_request) {
        core.warning(
          "⚠️ The '/ai-review' command was called on a standard Issue, but the bot only operates on Pull Requests. Ignoring.",
        );
        return;
      }

      core.info(
        "🔄 '/ai-review' command detected. Triggering AI analysis re-run...",
      );
    }

    // Pode vir de um 'pull_request.opened' ou de um comentário 'issue_comment'
    const pullNumber =
      context.payload.pull_request?.number || context.payload.issue?.number;

    // Fail-fast se a Action for chamada fora de um contexto de Pull Request
    if (!pullNumber) {
      core.warning(
        "⚠️ Action executed outside of a Pull Request context. Silently ignoring.",
      );
      return;
    }

    core.info(
      `🤖 Starting AI Code Reviewer on PR #${pullNumber} for ${owner}/${repo}`,
    );

    // ── [3] INICIALIZAÇÃO DOS SERVIÇOS ───────────────────────────────────────
    const ghService = new GithubService(
      new Octokit({ auth: githubToken }),
      owner,
      repo,
      pullNumber,
    );

    const aiClient = new OpenAI({ apiKey: aiKey, baseURL: aiBaseUrl });
    const aiService = new AIService(aiClient, aiModel);

    // ── [4] BUSCA DO DIFF ────────────────────────────────────────────────────
    const diffString = await ghService.fetchDiff();

    // Trava de segurança para limites da context-window da IA
    if (diffString.length > 200000) {
      core.warning(
        "⚠️ Warning: Diff is too large for automatic analysis (Limit 200,000 chars).",
      );
      await ghService.postComment(
"⚠️ **Warning:** The PR diff is too massive for the AI to analyze within context limits. Manual review is required.",
      );
      return;
    }

    // parseDiff divide o diff em Array[Arquivos[Chunks[Alterações]]]
    const files = parseDiff(diffString);
    const allReviews: GithubReviewComment[] = [];

    // Carrega as diretrizes uma única vez para todos os arquivos
    const globalGuidelines = await getGuidelines(
      customRulesInput,
      rulesPathInput,
    );

    // ── [5] MONTAGEM DAS TAREFAS DE IA ──────────────────────────────────────
    const tasks: (() => Promise<void>)[] = [];

    for (const file of files) {
      // Ignora arquivos deletados ou fora do escopo de revisão
      if (!file.to || file.to === "/dev/null") continue;
      if (isIgnoredFile(file.to)) continue;

      for (const chunk of file.chunks) {
        tasks.push(async () => {
          const validLines = getValidLines(chunk);

          // Nenhuma linha adicionada neste chunk, nada a comentar
          if (validLines.size === 0) return;

          const diffContent = buildDiffContent(chunk);
          const prompt = buildReviewPrompt(
            file.to!,
            globalGuidelines,
            diffContent,
          );

          try {
            const response = await aiService.analyze(prompt);

            if (response.trim().toUpperCase() === "OK") return;

            let rawJson;
            try {
              rawJson = JSON.parse(aiService.cleanJson(response));
            } catch {
              core.warning(
                `⚠️ Failed to parse JSON for file ${file.to}. Raw response discarded.`,
              );
              return;
            }

            // Valida o schema da resposta da IA antes de usar
            const validated = ReviewArraySchema.safeParse(rawJson);

            if (validated.success) {
              validated.data.forEach((c) => {
                // Checagem crítica: só aceita linhas que realmente existem no diff.
                // O GitHub bloqueia com HTTP 422 qualquer comentário em linha inválida.
                if (validLines.has(c.line)) {
                  allReviews.push({
                    path: file.to!,
                    line: c.line,
                    body: `🤖 **AI Bot:** ${c.message}`,
                    side: "RIGHT",
                  });
                }
              });
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            core.error(`❌ Failed mapping ${file.to}: ${msg}`);
          }
        });
      }
    }

    // ── [6] EXECUÇÃO ASSÍNCRONA CONTROLADA ──────────────────────────────────
    // Processa em lotes de 2 tasks simultâneas para respeitar o Rate Limit da IA.
    // Um delay de 3s entre batches evita rajadas que causam erros 429.
    core.info(
      `🧠 Processing a total of ${tasks.length} code blocks using controlled parallelism...`,
    );

    const CONCURRENCY_LIMIT = 2;
    const BATCH_DELAY_MS = 3000;

    for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
      const batch = tasks.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(batch.map((task) => task()));

      // Aguarda entre batches para não saturar a API
      if (i + CONCURRENCY_LIMIT < tasks.length) {
        await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
      }
    }

    // ── [7] FINALIZAÇÃO ──────────────────────────────────────────────────────
    if (allReviews.length > 0) {
      await ghService.postReviewBatches(allReviews);
    } else {
      core.info(
        "✨ All clean and successfully inspected! The code required no modifications.",
      );
    }
  } catch (error) {
    // Captura Fatal: core.setFailed marca a Action com X vermelho na esteira CI
    const e = error as Error;
    core.setFailed(`💥 Fatal Action Revisor failure: ${e.message}`);
  }
}

// Inicia a Action e garante que Promises pendentes não fiquem sem tratamento.
run();
