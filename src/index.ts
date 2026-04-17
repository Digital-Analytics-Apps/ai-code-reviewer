import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "octokit";
import OpenAI from "openai";
import parseDiff from "parse-diff";

import { AIService } from "./services/ai.service.js";
import { GithubService } from "./services/github.service.js";
import { AgentOrchestrator } from "./services/agent.orchestrator.js";
import {
  buildDiffContent,
  getValidLines,
  isIgnoredFile,
} from "./utils/diff.utils.js";
import { GithubReviewComment } from "./schemas/review.schema.js";

/**
 * Função principal da Action. Coordena todos os serviços e utilitários
 * para executar o fluxo de revisão modular baseado em agentes.
 *
 * Fase 1: Introdução do AgentOrchestrator + Security/General Agents.
 */
async function run(): Promise<void> {
  try {
    // ── [1] INPUTS ──────────────────────────────────────────────────────────
    const githubToken = core.getInput("github_token", { required: true });
    const aiKey = core.getInput("ai_api_key", { required: true });
    const aiBaseUrl = core.getInput("ai_base_url") || undefined;
    const aiModel = core.getInput("ai_model") || "gpt-4o-mini";

    core.setSecret(aiKey);

    // ── [2] CONTEXTO DO EVENTO ───────────────────────────────────────────────
    const context = github.context;
    const { owner, repo } = context.repo;

    if (context.eventName === "issue_comment") {
      const commentBody = context.payload.comment?.body || "";
      if (!commentBody.trim().startsWith("/ai-review")) return;
      if (!context.payload.issue?.pull_request) {
        core.warning("⚠️ '/ai-review' called outside of a PR. Ignoring.");
        return;
      }
    }

    const pullNumber = context.payload.pull_request?.number || context.payload.issue?.number;
    if (!pullNumber) {
      core.warning("⚠️ Action executed outside of a PR context. Ignoring.");
      return;
    }

    core.info(`🤖 Starting CONSELHO DE AGENTES (Phase 1) on PR #${pullNumber}`);

    // ── [3] INICIALIZAÇÃO DOS SERVIÇOS ───────────────────────────────────────
    const ghService = new GithubService(
      new Octokit({ auth: githubToken }),
      owner,
      repo,
      pullNumber,
    );

    const aiClient = new OpenAI({ apiKey: aiKey, baseURL: aiBaseUrl });
    const aiService = new AIService(aiClient, aiModel);
    const orchestrator = new AgentOrchestrator(aiService);

    // ── [4] BUSCA DO DIFF ────────────────────────────────────────────────────
    const diffString = await ghService.fetchDiff();

    if (diffString.length > 200000) {
      core.warning("⚠️ Diff too large (>200k chars). Manual review required.");
      await ghService.postComment("⚠️ **Warning:** The PR diff is too massive for automatic AI analysis.");
      return;
    }

    const files = parseDiff(diffString);
    const allReviews: GithubReviewComment[] = [];

    // ── [5] MONTAGEM DAS TAREFAS DE IA (MODULAR) ─────────────────────────────
    const tasks: (() => Promise<void>)[] = [];

    for (const file of files) {
      if (!file.to || file.to === "/dev/null") continue;
      if (isIgnoredFile(file.to)) continue;

      for (const chunk of file.chunks) {
        tasks.push(async () => {
          const validLines = getValidLines(chunk);
          if (validLines.size === 0) return;

          const diffContent = buildDiffContent(chunk);
          
          try {
            // Delega para o Orquestrador, que decide quais agentes chamar
            const chunkReviews = await orchestrator.reviewChunk(
              file.to!,
              file.to!,
              diffContent,
              validLines
            );

            allReviews.push(...chunkReviews);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            core.error(`❌ Failed reviewing ${file.to}: ${msg}`);
          }
        });
      }
    }

    // ── [6] EXECUÇÃO ASSÍNCRONA CONTROLADA ──────────────────────────────────
    core.info(`🧠 Processing ${tasks.length} logic blocks using Specialized Agents...`);

    const CONCURRENCY_LIMIT = 2;
    const BATCH_DELAY_MS = 3000;

    for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
      const batch = tasks.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(batch.map((task) => task()));

      if (i + CONCURRENCY_LIMIT < tasks.length) {
        await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
      }
    }

    // ── [7] FINALIZAÇÃO ──────────────────────────────────────────────────────
    if (allReviews.length > 0) {
      await ghService.postReviewBatches(allReviews);
    } else {
      core.info("✨ No issues found by the Council of Agents.");
    }
  } catch (error) {
    const e = error as Error;
    core.setFailed(`💥 Fatal failure: ${e.message}`);
  }
}

run();
