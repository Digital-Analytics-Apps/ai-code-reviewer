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
 * Define o ciclo de vida e utilitários comuns para prompts e chamadas de IA.
 */
export abstract class BaseAgent {
  constructor(protected aiService: AIService) {}

  /**
   * Identificador único do agente.
   */
  abstract getName(): string;

  /**
   * Retorna as diretrizes específicas deste agente.
   */
  abstract getGuidelines(): string;

  /**
   * Constrói o prompt final para o agente.
   */
  protected buildPrompt(fileName: string, diffContent: string): string {
    return `Você é o ${this.getName()}, um Engenheiro de Software Sênior especializado.
Analise detalhadamente este diff no arquivo ${fileName}.

Siga estas diretrizes de especialidade:
${this.getGuidelines()}

Diff do Arquivo:
${diffContent}

Instruções de Formatação:
Retorne estritamente um JSON Array deste formato: [{"line": number, "message": string}].
- Só crie um review se encontrar problemas relevantes nas linhas alteradas, referentes à sua especialidade.
- Ou retorne "OK" em CAIXA ALTA puro sem Markdown se não houver problemas detectados.`;
  }

  /**
   * Executa a análise do agente sobre um diff.
   */
  public async analyze(fileName: string, diffContent: string): Promise<AgentFinding[]> {
    const prompt = this.buildPrompt(fileName, diffContent);
    const response = await this.aiService.analyze(prompt);

    if (response.trim().toUpperCase() === "OK") {
      return [];
    }

    try {
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
