import { AIService } from "./ai.service";
import { MANAGER_SYSTEM_PROMPT } from "../guidelines/prompts/manager.prompt";
import { logger } from "../utils/logger";

export enum AgentCategory {
  SECURITY = "security",
  GENERAL = "general",
  PERFORMANCE = "performance",
  ARCHITECTURE = "architecture",
}

export interface TriageResult {
  language: string;
  suggestedAgents: AgentCategory[];
  impactfulSymbols: string[];
  reasoning: string;
}

/**
 * Serviço de Triage (AI-Native Manager Agent).
 * Decide quais especialistas devem atuar com base no conteúdo do arquivo.
 */
export class TriageService {
  constructor(private aiService: AIService) {}

  public async triageFile(
    filePath: string,
    diffContent: string,
  ): Promise<TriageResult> {
    const userContent = `Arquivo: ${filePath}\n\nDiff:\n${diffContent}`;

    try {
      const response = await this.aiService.analyze(
        MANAGER_SYSTEM_PROMPT,
        userContent,
      );
      const cleaned = this.aiService.cleanJson(response);
      const json = JSON.parse(cleaned);

      const result: TriageResult = {
        language: json.language || "unknown",
        suggestedAgents: (json.agents || []).map(
          (a: string) => a.toLowerCase() as AgentCategory,
        ),
        impactfulSymbols: json.impactfulSymbols || [],
        reasoning: json.reasoning || "Triage realizado via IA.",
      };

      logger.info(
        `🔍 AI Triage result for ${filePath}: [${result.language}] - Agents: ${result.suggestedAgents.join(",")} - Symbols: ${result.impactfulSymbols.join(",")}`,
      );
      return result;
    } catch (error) {
      logger.warn(
        `⚠️ AI Triage failed for ${filePath}, falling back to default. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        language: "unknown",
        suggestedAgents: [AgentCategory.SECURITY, AgentCategory.GENERAL],
        impactfulSymbols: [],
        reasoning: "Fallback para todos os agentes devido a erro na triage.",
      };
    }
  }
}
