import { AIService } from "./ai.service";
import { AgentCategory, TriageService } from "./triage.service";
import { SecurityAgent } from "../agents/security.agent";
import { GeneralAgent } from "../agents/general.agent";
import { BaseAgent, AgentFinding } from "../agents/base.agent";
import { GithubReviewComment } from "../schemas/review.schema";
import { GithubService } from "./github.service";

/**
 * Orquestrador de Agentes (Fase 4: Global Context Aware).
 */
export class AgentOrchestrator {
  private triageService: TriageService;
  private agents: Map<AgentCategory, BaseAgent> = new Map();

  constructor(
    private aiService: AIService,
    private githubService: GithubService,
    private customRules: string = "",
  ) {
    this.triageService = new TriageService(aiService);
    this.agents.set(AgentCategory.SECURITY, new SecurityAgent(aiService));
    this.agents.set(AgentCategory.GENERAL, new GeneralAgent(aiService));
  }

  /**
   * Realiza a revisão de um arquivo completo.
   */
  public async reviewFile(
    filePath: string,
    diffContent: string,
    validLines: number[],
  ): Promise<GithubReviewComment[]> {
    const fileName = filePath.split("/").pop() || filePath;
    const triage = await this.triageService.triageFile(filePath, diffContent);
    const validLinesSet = new Set(validLines);

    // --- DESCOBERTA DE IMPACTO GLOBAL (FASE 4) ---
    let globalContext = "";
    if (triage.impactfulSymbols.length > 0) {
      globalContext = await this.discoverGlobalContext(
        triage.impactfulSymbols,
        filePath,
      );
    }

    const rawFindings: { agent: string; findings: AgentFinding[] }[] = [];

    // 1. Coleta achados (agora com contexto global injetado)
    const activeAgents = Array.from(this.agents.entries());
    for (const [category, agent] of activeAgents) {
      // Apenas roda se sugerido pela triage
      if (
        triage.suggestedAgents.includes(category) ||
        (category === AgentCategory.GENERAL &&
          triage.suggestedAgents.some((a) =>
            ["performance", "architecture"].includes(a),
          ))
      ) {
        // Injetamos as regras customizadas + contexto global no prompt
        const extendedRules = `${this.customRules}\n\n# GLOBAL IMPACT CONTEXT:\n${globalContext || "Sem impactos externos detectados."}`;
        const res = await agent.analyze(fileName, diffContent, extendedRules);
        rawFindings.push({ agent: agent.getName(), findings: res });
      }
    }

    // 2. Deduplicação e Consolidação
    return this.consolidateFindings(rawFindings, filePath, validLinesSet);
  }

  /**
   * Busca por usos dos símbolos alterados no restante do repositório.
   */
  private async discoverGlobalContext(
    symbols: string[],
    currentPath: string,
  ): Promise<string> {
    let context =
      "Detectamos que as alterações neste arquivo podem impactar os seguintes pontos do sistema:\n";

    for (const symbol of symbols.slice(0, 3)) {
      // Limitamos a 3 símbolos para evitar spam
      const usages = await this.githubService.searchCode(symbol);
      const externalUsages = usages
        .filter((u) => u.path !== currentPath)
        .slice(0, 2);

      for (const usage of externalUsages) {
        const content = await this.githubService.getFileContent(usage.path);
        const allLines = content.split("\n");

        // Pega um snippet ao redor da linha encontrada (10 antes, 10 depois)
        const start = Math.max(0, usage.line - 10);
        const end = Math.min(allLines.length, usage.line + 10);
        const snippet = allLines.slice(start, end).join("\n");

        context += `\n--- [USO EXTERNO EM: ${usage.path} (Linha ${usage.line})] ---\n${snippet}\n`;
      }
    }

    return context;
  }

  private consolidateFindings(
    groups: { agent: string; findings: AgentFinding[] }[],
    path: string,
    validLines: Set<number>,
  ): GithubReviewComment[] {
    const consolidated = new Map<number, Set<string>>();
    for (const group of groups) {
      for (const finding of group.findings) {
        if (!validLines.has(finding.line)) continue;
        if (!consolidated.has(finding.line))
          consolidated.set(finding.line, new Set());
        consolidated.get(finding.line)!.add(finding.message);
      }
    }

    const finalReviews: GithubReviewComment[] = [];
    consolidated.forEach((messages, line) => {
      messages.forEach((msg) => {
        finalReviews.push({
          path,
          line,
          body: `🤖 **AI Bot:** ${msg}`,
          side: "RIGHT",
        });
      });
    });
    return finalReviews;
  }
}
