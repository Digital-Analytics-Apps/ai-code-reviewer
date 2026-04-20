/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from "node:fs";
import { Octokit } from "octokit";
import { SummaryAgent } from "./agents/summary.agent";
import { GithubReviewComment } from "./schemas/review.schema";
import { AgentOrchestrator } from "./services/agent.orchestrator";
import { AIService } from "./services/ai.service";
import { GithubService } from "./services/github.service";
import { JiraService } from "./services/jira.service";
import { isIgnoredFile, parseDiff } from "./utils/diff.utils";
import { logger } from "./utils/logger";

function getDiffLinePrefix(type: string): string {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}

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
 * Obtém a configuração da AI.
 */
function getConfig() {
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

  return {
    githubToken: getVar("GITHUB_TOKEN"),
    aiKey: getVar("AI_API_KEY"),
    aiModel: getVar("AI_MODEL", "gpt-4o-mini"),
    aiBaseUrl: getVar("AI_BASE_URL", "https://api.openai.com/v1"),
    effectiveRules,
  };
}

/**
 * Obtém o contexto do Pull Request.
 */
function getPullRequestContext() {
  const [owner, repo] = (getVar("GITHUB_REPOSITORY") || "").split("/");
  let pullNumber = Number.parseInt(getVar("PULL_NUMBER", "0"), 10);

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

  return { owner, repo, pullNumber };
}

/**
 * Obtém a configuração do Jira.
 */
function getJiraConfiguration() {
  return {
    enabled: getVar("ENABLE_JIRA") === "true",
    host: getVar("JIRA_HOST"),
    email: getVar("JIRA_EMAIL"),
    token: getVar("JIRA_TOKEN"),
    projectKey: getVar("JIRA_PROJECT"),
  };
}

/**
 * Valida se todas as variáveis necessárias foram configuradas.
 */
function validateRequiredInputs(config: any, context: any) {
  if (!config.githubToken || !config.aiKey || !context.pullNumber) {
    logger.error("❌ Falha na validação de variáveis obrigatórias:");
    if (!config.githubToken) logger.error("- GITHUB_TOKEN está vazio.");
    if (!config.aiKey) logger.error("- AI_API_KEY está vazio.");
    if (!context.pullNumber)
      logger.error(
        "- PULL_NUMBER não foi detectado (garanta que o evento seja um Pull Request).",
      );

    throw new Error("Faltam variáveis obrigatórias.");
  }
}

/**
 * Processa os arquivos do diff e gera os comentários.
 */
async function processFiles(
  orchestrator: AgentOrchestrator,
  files: any[],
): Promise<GithubReviewComment[]> {
  const allFindings: GithubReviewComment[] = [];
  logger.info(`📝 Analisando ${files.length} arquivos...`);

  const analyzeFile = async (file: any) => {
    if (!file.to || file.chunks.length === 0) return null;

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
          const lineNum = change.ln || change.ln1 || change.ln2;
          if (change.type === "add") validLines.add(lineNum);
          const prefix = getDiffLinePrefix(change.type);
          diffContent += `${lineNum}: ${prefix}${change.content}\n`;
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

  const BATCH_SIZE = 2;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    if (i > 0) {
      logger.info("⏳ Aguardando respiro para evitar Rate Limit (429)...");
      await new Promise((res) => setTimeout(res, 1500));
    }

    const results = await Promise.all(batch.map(analyzeFile));
    results.forEach((res) => {
      if (res) allFindings.push(...res);
    });
  }

  return allFindings;
}

/**
 * Finaliza a revisão de código.
 */
async function finalizeReview(
  ghService: GithubService,
  summaryAgent: SummaryAgent,
  jiraService: JiraService | null,
  allFindings: GithubReviewComment[],
) {
  if (allFindings.length > 0) {
    logger.info("📊 Gerando Resumo Executivo e Veredito Final...");
    const summary = await summaryAgent.summarize(allFindings);

    await ghService.upsertSummaryComment(summary);
    await ghService.submitReview(allFindings);

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
}

/**
 * Executa o fluxo completo de revisão de código.
 */
async function run() {
  try {
    logger.info("🚀 AI Code Reviewer: Council of Agents - Starting...");

    const config = getConfig();
    const context = getPullRequestContext();
    const jiraConfig = getJiraConfiguration();

    validateRequiredInputs(config, context);

    // ── [2] INICIALIZAÇÃO DOS SERVIÇOS ───────────────────────────────────────
    const ghService = new GithubService(
      new Octokit({ auth: config.githubToken }),
      context.owner,
      context.repo,
      context.pullNumber,
    );

    // Limpa comentários e revisões anteriores do bot para evitar poluição no PR
    await ghService.cleanPreviousReviews();
    const aiService = new AIService(
      config.aiKey,
      config.aiBaseUrl,
      config.aiModel,
    );
    const orchestrator = new AgentOrchestrator(
      aiService,
      ghService,
      config.effectiveRules,
    );
    const jiraService = jiraConfig.enabled ? new JiraService(jiraConfig) : null;
    const summaryAgent = new SummaryAgent(aiService);

    const diffString = await ghService.fetchDiff();
    const files = parseDiff(diffString);

    const allFindings = await processFiles(orchestrator, files);

    await finalizeReview(ghService, summaryAgent, jiraService, allFindings);

    logger.info("🏁 AI Code Review finalizado com sucesso.");
  } catch (error: any) {
    logger.error("💥 Erro Fatal na execução:", error.message || error);
    process.exit(1);
  }
}

run();
