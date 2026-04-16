import * as core from "@actions/core";
import OpenAI from "openai";

// ==========================================
// SERVIÇO: AIService
// ==========================================

/**
 * Responsável por gerir a Inteligência Artificial via API OpenAI-Compatible.
 * Funciona com qualquer provedor que implemente o protocolo OpenAI:
 * OpenAI, Anthropic (via proxy), Gemini, Ollama, vLLM, etc.
 */
export class AIService {
  constructor(
    private openai: OpenAI,
    private modelName: string,
  ) {}

  /**
   * Envia o prompt para a IA e retorna o conteúdo da resposta.
   * Utiliza retry automático com Backoff Exponencial em caso de falhas temporárias.
   */
  async analyze(prompt: string): Promise<string> {
    const result = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    );
    return result.choices[0]?.message?.content || "OK";
  }

  /**
   * Retry com Backoff Exponencial.
   * Se a API cair ou recusar por limite de taxa, tenta novamente
   * automaticamente com espera crescente: 5s → 10s → 20s → 40s → 80s.
   * 5 tentativas cobrem janelas de rate limit de até ~2 minutos.
   */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: unknown) {
        // Status 503 e 429 = Serviço indisponível ou Too Many Requests (erros temporários de IA)
        const err = error as { status?: number; message?: string };
        const isRetryable =
          err.status === 503 ||
          err.status === 429 ||
          err.message?.includes("high demand") ||
          err.message?.includes("rate limit");

        if (!isRetryable || i === maxRetries - 1) throw error;

        // Backoff exponencial com base 5s: 5s, 10s, 20s, 40s...
        const delay = 5000 * Math.pow(2, i);
        core.warning(
          `⚠️ API Error (Attempt ${i + 1}/${maxRetries}). Retrying in ${delay}ms...`,
        );
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error("Failed after maximum retries");
  }

  /**
   * Limpa o Markdown da resposta da IA.
   * Se a IA retornar "```json [...] ```", extrai apenas o array JSON.
   */
  cleanJson(text: string): string {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\n?/, "").replace(/```$/, "");
    }
    const match = cleaned.match(/\[\s*\{.*\}\s*\]/s);
    return match ? match[0] : cleaned;
  }
}
