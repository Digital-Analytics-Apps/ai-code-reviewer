import { Octokit } from "octokit";
import { GithubService } from "./services/github.service";
import { AIService } from "./services/ai.service";
import { AgentOrchestrator } from "./services/agent.orchestrator";
import { JiraService } from "./services/jira.service";
import { SummaryAgent } from "./agents/summary.agent";
import { parseDiff } from "./utils/diff.utils";
import { logger } from "./utils/logger";
import { GithubReviewComment } from "./schemas/review.schema";

/**
 * Função principal que orquestra as Fases 1 a 5.
 */
async function run() {
  try {
    logger.info("🚀 AI Code Reviewer: Council of Agents - Starting...");

    // ── [1] AMBIENTE E CREDENCIAIS ───────────────────────────────────────────
    const githubToken = process.env.GITHUB_TOKEN || "";
    const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
    const pullNumber = parseInt(
      process.env.GITHUB_EVENT_PULL_NUMBER || "0",
      10,
    );

    const aiKey = process.env.AI_API_KEY || "";
    const aiBaseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    const aiModel = process.env.AI_MODEL || "gpt-4o-mini";
    const customRules = process.env.CUSTOM_RULES || "";

    // ── [2] INPUTS JIRA (ENTERPRISE) ────────────────────────────────────────
    const enableJira = process.env.ENABLE_JIRA === "true";
    const jiraConfig = {
      host: process.env.JIRA_HOST || "",
      email: process.env.JIRA_EMAIL || "",
      token: process.env.JIRA_TOKEN || "",
      projectKey: process.env.JIRA_PROJECT || "",
    };

    if (!githubToken || !aiKey || !pullNumber) {
      throw new Error(
        "❌ Faltam variáveis de ambiente obrigatórias (GITHUB_TOKEN, AI_API_KEY, PULL_NUMBER).",
      );
    }

    // ── [3] INICIALIZAÇÃO DOS SERVIÇOS ───────────────────────────────────────
    const ghService = new GithubService(
      new Octokit({ auth: githubToken }),
      owner,
      repo,
      pullNumber,
    );
    const aiService = new AIService(aiKey, aiBaseUrl, aiModel);
    const orchestrator = new AgentOrchestrator(
      aiService,
      ghService,
      customRules,
    );
    const jiraService = enableJira ? new JiraService(jiraConfig) : null;
    const summaryAgent = new SummaryAgent(aiService);

    // ── [4] BUSCA DO DIFF ────────────────────────────────────────────────────
    const diffString = await ghService.fetchDiff();
    const files = parseDiff(diffString);
    const allFindings: GithubReviewComment[] = [];

    // ── [5] REVISÃO ARQUIVO POR ARQUIVO (PARALELISMO CONTROLADO) ─────────────
    logger.info(`📝 Analisando ${files.length} arquivos...`);

    for (const file of files) {
      if (!file.to || file.chunks.length === 0) continue;

      const validLines = new Set<number>();
      let diffContent = "";

      file.chunks.forEach((chunk) => {
        chunk.changes.forEach((change) => {
          if (change.type === "add") validLines.add(change.ln);
          diffContent += `${change.type === "add" ? "+" : change.type === "del" ? "-" : " "}${change.content}\n`;
        });
      });

      const fileName = file.to;
      const findings = await orchestrator.reviewChunk(
        file.to,
        fileName,
        diffContent,
        validLines,
      );
      allFindings.push(...findings);

      // ── [6] INTEGRAÇÃO JIRA (OPCIONAL) ─────────────────────────────────────
      if (jiraService) {
        const blockingIssues = findings.filter((f) =>
          f.body.includes("🔴 BLOCKING"),
        );
        for (const issue of blockingIssues) {
          const ticketKey = await jiraService.createIssue(
            `[AI-REVIEW] ${fileName}`,
            issue.body,
          );
          if (ticketKey) {
            issue.body += `\n\n🎫 **JIRA Ticket Criado:** [${ticketKey}](https://${jiraConfig.host}/browse/${ticketKey})`;
          }
        }
      }
    }

    // ── [7] POSTAGEM DOS COMENTÁRIOS INLINE ──────────────────────────────────
    await ghService.submitReview(allFindings);

    // ── [8] FASE 5: RESUMO EXECUTIVO E VEREDITO ──────────────────────────────
    logger.info("📊 Gerando Resumo Executivo e Veredito...");
    const summary = await summaryAgent.summarize(allFindings);
    await ghService.createIssueComment(summary);

    logger.info("✅ Code Review finalizado com sucesso!");
  } catch (error) {
    logger.error(
      "💥 Erro Fatal na execução:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

run();
