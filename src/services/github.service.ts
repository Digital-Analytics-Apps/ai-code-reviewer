/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "octokit";
import { GithubReviewComment } from "../schemas/review.schema";
import { logger } from "../utils/logger";

/**
 * Serviço de Integração com GitHub.
 * Centraliza buscas de Diff, postagem de comentários e busca global de código.
 */
export class GithubService {
  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string,
    private pullNumber: number,
  ) {}

  /**
   * Busca o diff completo do Pull Request.
   */
  public async fetchDiff(): Promise<string> {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: this.pullNumber,
      mediaType: { format: "diff" },
    });
    return data as unknown as string;
  }

  /**
   * Envia os comentários de revisão em lotes para evitar Rate Limits.
   */
  public async submitReview(reviews: GithubReviewComment[]): Promise<void> {
    if (reviews.length === 0) {
      logger.info("✨ Nenhum problema encontrado pelos agentes.");
      return;
    }

    const CHUNK_SIZE = 30; // Limite de comentários por bloco
    const totalBatches = Math.ceil(reviews.length / CHUNK_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = reviews.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

      logger.info(`📤 Enviando bloco de revisão ${i + 1}/${totalBatches}...`);

      await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.pullNumber,
        event: "COMMENT",
        body: `🤖 **AI Code Review (Part ${i + 1}/${totalBatches})**\n\nTotal de achados: ${reviews.length}.`,
        comments: batch,
      });

      if (totalBatches > 1 && i < totalBatches - 1) {
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }

  /**
   * Busca por um termo (símbolo) em todo o repositório (Global Impact Discovery).
   */
  public async searchCode(
    query: string,
  ): Promise<{ path: string; line: number }[]> {
    try {
      const { data } = await this.octokit.rest.search.code({
        q: `${query} repo:${this.owner}/${this.repo}`,
      });

      return data.items.map((item: any) => ({
        path: item.path,
        line: 1,
      }));
    } catch (error) {
      logger.warn(`⚠️ Falha na busca global por '${query}':`, error);
      return [];
    }
  }

  /**
   * Posta um comentário geral no Pull Request (não inline).
   */
  public async createIssueComment(body: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.pullNumber,
        body,
      });
    } catch (error) {
      logger.error("❌ Falha ao postar comentário de resumo:", error);
    }
  }

  /**
   * Busca o conteúdo bruto de um arquivo.
   */
  public async getFileContent(path: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      });

      if ("content" in data) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return "";
    } catch {
      return "";
    }
  }
}
