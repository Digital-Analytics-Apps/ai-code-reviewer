import { logger } from "../utils/logger";
import { Octokit } from "octokit";
import { GithubReviewComment } from "../schemas/review.schema.js";

// ==========================================
// SERVIÇO: GithubService
// ==========================================

/**
 * Responsável por toda a comunicação com a API REST do GitHub.
 * Isola completamente a lógica de rede do GitHub do orquestrador principal.
 */
export class GithubService {
  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string,
    private pullNumber: number,
  ) {}

  /**
   * Puxa o "Diff" (texto que mostra as linhas apagadas em vermelho
   * e adicionadas em verde) do Pull Request inteiro.
   */
  async fetchDiff(): Promise<string> {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: this.pullNumber,
      // Passando mediaType: "diff" o GitHub retorna o diff bruto como texto,
      // ao invés de um JSON do PR.
      mediaType: { format: "diff" },
    });
    return data as unknown as string;
  }

  /**
   * Faz um comentário solto no histórico do PR.
   * Útil para Erros, Avisos ou Mensagens de Status da Action.
   */
  async postComment(body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.pullNumber,
      body,
    });
  }

  /**
   * Envia todos os comentários que a IA gerou de uma vez,
   * com paginação para evitar quebrar limites da API do GitHub.
   */
  async postReviewBatches(reviews: GithubReviewComment[]): Promise<void> {
    const CHUNK_SIZE = 50; // O GitHub aguenta bem 50 comentários por revisão global
    const totalBatches = Math.ceil(reviews.length / CHUNK_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = reviews.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      logger.info(`📦 Sending batch ${i + 1}/${totalBatches}...`);

      await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.pullNumber,
        event: "COMMENT", // "COMMENT" envia sem aprovar ou reprovar o PR explicitamente.
        body: `🤖 **AI Code Review (Part ${i + 1}/${totalBatches})**\n\nTotal issues identified: ${reviews.length}.`,
        comments: batch, // Aqui injetamos as notas inline no código
      });

      // Pausa estratégica de 2s para respeitar o Rate Limit do GitHub
      // caso seja necessário enviar vários blocos.
      if (totalBatches > 1 && i < totalBatches - 1) {
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }
}
