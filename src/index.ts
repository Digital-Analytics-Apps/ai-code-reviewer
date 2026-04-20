/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "octokit";
import * as fs from "fs";
import { GithubService } from "./services/github.service";
import { AIService } from "./services/ai.service";
import { AgentOrchestrator } from "./services/agent.orchestrator";
import { JiraService } from "./services/jira.service";
import { SummaryAgent } from "./agents/summary.agent";
import { parseDiff, isIgnoredFile } from "./utils/diff.utils";
import { logger } from "./utils/logger";
import { GithubReviewComment } from "./schemas/review.schema";

/**
 * Função utilitária para capturar inputs de forma resiliente
 * (Tanto via ENV quanto via GitHub Action Inputs).
 */
function getVar(name: string, defaultValue = ""): string {
  const envName = name.toUpperCase();
  const inputName = `INPUT_${envName}`;
  return process.env[envName] || process.env[inputName] || defaultValue;
}

/**
 * Função principal que orquestra as Fases 1 a 5.
 */
async function run() {
  try {
    logger.info("🚀 AI Code Reviewer: Council of Agents - Starting...");

    // ── [1] AMBIENTE E CREDENCIAIS ───────────────────────────────────────────
    const githubToken = getVar("GITHUB_TOKEN");
    const aiKey = getVar("AI_API_KEY");
    const aiModel = getVar("AI_MODEL", "gpt-4o-mini");
    const aiBaseUrl = getVar("AI_BASE_URL", "https://api.openai.com/v1");
    const customRules = getVar("CUSTOM_RULES");
    const rulesPath = getVar("RULES_PATH");

    let effectiveRules = customRules;
    if (rulesPath) {
      if (fs.existsSync(rulesPath)) {
        logger.info(`📖 Lendo regras customizadas de: ${rulesPath}`);
        const fileRules = fs.readFileSync(rulesPath, "utf-8");
        effectiveRules = effectiveRules
          ? `${effectiveRules}\n\n${fileRules}`
          : fileRules;
      } else {
        logger.warn(`⚠️ Arquivo de regras não encontrado: ${rulesPath}`);
      }
    }

    // Identificação do Repositório
    const [owner, repo] = (getVar("GITHUB_REPOSITORY") || "").split("/");

    // Identificação do Pull Request (Tenta ENV, depois tenta ler do arquivo de evento do GitHub)
    let pullNumber = parseInt(getVar("PULL_NUMBER", "0"), 10);

    if (!pullNumber && process.env.GITHUB_EVENT_PATH) {
      try {
        const event = JSON.parse(
          fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
        );
        pullNumber = event.pull_request?.number || 0;
      } catch {
        logger.warn(
          "⚠️ Não foi possível ler o número do PR do GITHUB_EVENT_PATH",
        );
      }
    }

    // ── [2] INPUTS JIRA (ENTERPRISE) ────────────────────────────────────────
    const enableJira = getVar("ENABLE_JIRA") === "true";
    const jiraConfig = {
      host: getVar("JIRA_HOST"),
      email: getVar("JIRA_EMAIL"),
      token: getVar("JIRA_TOKEN"),
      projectKey: getVar("JIRA_PROJECT"),
    };

    // DEBUG para ajudar o usuário se falhar
    if (!githubToken || !aiKey || !pullNumber) {
      logger.error("❌ Falha na validação de variáveis obrigatórias:");
      if (!githubToken) logger.error("- GITHUB_TOKEN está vazio.");
      if (!aiKey) logger.error("- AI_API_KEY está vazio.");
      if (!pullNumber)
        logger.error(
          "- PULL_NUMBER não foi detectado (garanta que o evento seja um Pull Request).",
        );

      throw new Error("Faltam variáveis obrigatórias.");
    }

    // ── [3] INICIALIZAÇÃO DOS SERVIÇOS ───────────────────────────────────────
    const ghService = new GithubService(
      new Octokit({ auth: githubToken }),
      owner,
      repo,
      pullNumber,
    );

    // Limpa comentários e revisões anteriores do bot para evitar poluição no PR
    await ghService.cleanPreviousReviews();
    const aiService = new AIService(aiKey, aiBaseUrl, aiModel);
    const orchestrator = new AgentOrchestrator(
      aiService,
      ghService,
      effectiveRules,
    );
    const jiraService = enableJira ? new JiraService(jiraConfig) : null;
    const summaryAgent = new SummaryAgent(aiService);

    // ── [4] BUSCA DO DIFF ────────────────────────────────────────────────────
    const diffString = await ghService.fetchDiff();
    const files = parseDiff(diffString);
    const allFindings: GithubReviewComment[] = [];

    // ── [5] REVISÃO ARQUIVO POR ARQUIVO (PROCESSAMENTO PARALELO CONTROLADO) ──
    logger.info(`📝 Analisando ${files.length} arquivos...`);

    const analyzeFile = async (file: any) => {
      if (!file.to || file.chunks.length === 0) return null;

      // Pular se for arquivo ignorado
      if (isIgnoredFile(file.to)) {
        logger.info(`⏭️ Ignorando arquivo: ${file.to}`);
        return null;
      }

      logger.startGroup(`🔍 Analisando: ${file.to}`);
      try {
        const validLines = new Set<number>();
        let diffContent = "";

        file.chunks.forEach((chunk: any) => {
          chunk.changes.forEach((change: any) => {
            if (change.type === "add") validLines.add(change.ln);
            diffContent += `${change.type === "add" ? "+" : change.type === "del" ? "-" : " "}${change.content}\n`;
          });
        });

        const findings = await orchestrator.reviewFile(
          file.to,
          diffContent,
          Array.from(validLines),
        );

        if (findings.length > 0) {
          logger.info(`✅ ${findings.length} achados em ${file.to}`);
          return findings;
        }
        return [];
      } catch (error: any) {
        logger.error(`❌ Erro ao analisar arquivo ${file.to}:`, error);
        return [];
      } finally {
        logger.endGroup();
      }
    };

    // Executa em lotes de 3 arquivos para otimizar performance sem estourar limites de memória/IA
    const BATCH_SIZE = 3;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(analyzeFile));
      results.forEach((res) => {
        if (res) allFindings.push(...res);
      });
    }

    // ── [6] CONSOLIDAÇÃO E VEREDITO FINAL ────────────────────────────────────
    if (allFindings.length > 0) {
      logger.info("📊 Gerando Resumo Executivo e Veredito Final...");
      const summary = await summaryAgent.summarize(allFindings);

      // Posta ou atualiza o resumo como comentário principal (Upsert)
      await ghService.upsertSummaryComment(summary);

      // Posta os comentários inline
      await ghService.submitReview(allFindings);

      // Integração JIRA: Criar tickets para BLOCKING
      if (jiraService) {
        const blockingIssues = allFindings.filter((f) =>
          f.body.includes("BLOCKING"),
        );
        for (const issue of blockingIssues) {
          logger.info(
            `🎫 Criando ticket JIRA para achado crítico em ${issue.path}...`,
          );
          await jiraService.createIssue(
            `AI Review Finding: ${issue.path} (Line ${issue.line})`,
            issue.body,
          );
        }
      }
    } else {
      logger.info("✨ Nenhum problema encontrado. O código está excelente!");
      await ghService.upsertSummaryComment(
        "✅ **AI Code Review:** O conselho de agentes analisou seu código e não encontrou problemas. Bom trabalho!",
      );
    }

    logger.info("🏁 AI Code Review finalizado com sucesso.");
  } catch (error: any) {
    logger.error("💥 Erro Fatal na execução:", error.message || error);
    process.exit(1);
  }
}

run();
