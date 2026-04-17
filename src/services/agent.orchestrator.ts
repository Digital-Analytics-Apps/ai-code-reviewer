import { AIService } from "./ai.service";
import { AgentCategory, TriageService } from "./triage.service";
import { SecurityAgent } from "../agents/security.agent";
import { GeneralAgent } from "../agents/general.agent";
import { BaseAgent, AgentFinding } from "../agents/base.agent";
import { GithubReviewComment } from "../schemas/review.schema";
import { logger } from "../utils/logger";

/**
 * Orquestrador de Agentes (O "Cérebro" do Conselho).
 * Gerencia o ciclo de vida, triage e a execução das especialidades.
 */
export class AgentOrchestrator {
  private triageService: TriageService;
  private agents: Map<AgentCategory, BaseAgent> = new Map();

  constructor(aiService: AIService) {
    this.triageService = new TriageService();
    
    // Inicializa os agentes suportados na Fase 1
    this.agents.set(AgentCategory.SECURITY, new SecurityAgent(aiService));
    this.agents.set(AgentCategory.GENERAL, new GeneralAgent(aiService));
  }

  /**
   * Processa um arquivo/chunk e retorna os achados consolidados.
   */
  public async reviewChunk(
    filePath: string,
    fileName: string,
    diffContent: string,
    validLines: Set<number>
  ): Promise<GithubReviewComment[]> {
    const triage = this.triageService.triageFile(filePath);
    const findings: GithubReviewComment[] = [];

    logger.info(`🔍 Triage result for ${fileName}: [${triage.language}] - Agents: ${triage.suggestedAgents.join(", ")}`);

    // --- FASE 1: SEGURANÇA (GATEKEEPER) ---
    if (triage.suggestedAgents.includes(AgentCategory.SECURITY)) {
      const securityAgent = this.agents.get(AgentCategory.SECURITY);
      if (securityAgent) {
        const result = await securityAgent.analyze(fileName, diffContent);
        this.mapFindings(result, filePath, validLines, findings);
      }
    }

    // --- FASE 2: LÓGICA / GERAL ---
    // Na Fase 1, tratamos PERFORMANCE/ARCHITECTURE como GENERAL
    if (triage.suggestedAgents.some(a => [AgentCategory.GENERAL, AgentCategory.PERFORMANCE, AgentCategory.ARCHITECTURE].includes(a))) {
      const generalAgent = this.agents.get(AgentCategory.GENERAL);
      if (generalAgent) {
        const result = await generalAgent.analyze(fileName, diffContent);
        this.mapFindings(result, filePath, validLines, findings);
      }
    }

    return findings;
  }

  /**
   * Converte AgentFinding[] em GithubReviewComment[] validando as linhas.
   */
  private mapFindings(
    rawFindings: AgentFinding[],
    path: string,
    validLines: Set<number>,
    target: GithubReviewComment[]
  ): void {
    for (const f of rawFindings) {
      if (validLines.has(f.line)) {
        target.push({
          path,
          line: f.line,
          body: `🤖 **AI Bot:** ${f.message}`,
          side: "RIGHT",
        });
      }
    }
  }
}
