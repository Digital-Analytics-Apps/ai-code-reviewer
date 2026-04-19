import { AIService } from "../services/ai.service";
import { SUMMARY_SYSTEM_PROMPT } from "../guidelines/prompts/summary.prompt";
import { GithubReviewComment } from "../schemas/review.schema";

/**
 * Agente Executivo responsável por sumarizar a revisão completa do PR.
 */
export class SummaryAgent {
  constructor(private aiService: AIService) {}

  /**
   * Gera um resumo executivo baseado em todos os comentários feitos.
   */
  public async summarize(findings: GithubReviewComment[]): Promise<string> {
    if (findings.length === 0) {
      return "## ✅ Resumo Executivo\n\nNão foram encontrados problemas relevantes. O código parece estar em conformidade com as diretrizes.";
    }

    const findingsText = findings
      .map((f) => `- [${f.path} (Linha ${f.line})]: ${f.body}`)
      .join("\n");

    const userContent = `Aqui estão os achados da revisão:\n\n${findingsText}`;

    try {
      const response = await this.aiService.analyze(
        SUMMARY_SYSTEM_PROMPT,
        userContent,
      );
      return response;
    } catch {
      return "## ⚠️ Resumo Executivo\n\nFalha ao gerar o resumo automático, mas problemas foram identificados nos comentários inline.";
    }
  }
}
