import { AIService } from "../services/ai.service.js";

/**
 * Interface base para os achados de um agente.
 */
export interface AgentFinding {
  line: number;
  message: string;
}

/**
 * Classe Abstrata Base para todos os Agentes Especializados.
 */
export abstract class BaseAgent {
  constructor(protected aiService: AIService) {}

  /**
   * Identificador único do agente.
   */
  abstract getName(): string;

  /**
   * Retorna as diretrizes específicas deste agente (System Prompt).
   */
  abstract getGuidelines(): string;

  /**
   * Executa a análise do agente sobre um diff.
   * @param fileName Nome do arquivo
   * @param diffContent Conteúdo do diff
   * @param customRules Regras de negócio adicionais enviadas pelo usuário
   */
  public async analyze(
    fileName: string,
    diffContent: string,
    customRules: string = "",
  ): Promise<AgentFinding[]> {
    const systemPrompt = `
${this.getGuidelines()}

# Custom Business Rules (Priority):
${customRules || "Nenhuma regra customizada fornecida."}

# Instruções de Saída:
- Analise apenas o código fornecido no diff.
- Retorne estritamente um JSON Array neste formato: [{"line": number, "message": string}].
- Se não houver problemas, retorne um array vazio [].
    `.trim();

    const userContent = `Arquivo: ${fileName}\nDiff:\n${diffContent}`;

    try {
      const response = await this.aiService.analyze(systemPrompt, userContent);
      const cleaned = this.aiService.cleanJson(response);

      const rawJson = JSON.parse(cleaned);
      if (Array.isArray(rawJson)) {
        return rawJson as AgentFinding[];
      }
      return [];
    } catch {
      return [];
    }
  }
}
