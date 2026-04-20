import { AIService } from "../services/ai.service.js";

/**
 * Interface base para os achados de um agente.
 */
export interface AgentFinding {
  line: number;
  message: string;
  suggestion?: string; // Novo: snippet de código sugerido
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

# Input Format:
O código recebido terá o formato "linha: [+/-] código". 
Exemplo: "26: + const x = 1;"
Você deve extrair o número da linha e usá-lo no campo "line".

# Custom Business Rules (Priority):
${customRules || "Nenhuma regra customizada fornecida."}

# Instruções de Saída:
- Analise apenas o código fornecido no diff.
- Retorne estritamente um JSON Array: [{"line": number, "message": string, "suggestion": string}].
- No campo "suggestion", forneça um snippet de código corrigido (se aplicável). Use Markdown se necessário.
- O campo "suggestion" é opcional, use apenas quando uma correção de código for clara.
- O número da linha DEVE ser idêntico ao número prefixado no código.
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
