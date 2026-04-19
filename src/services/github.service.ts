/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "octokit";
import { execSync } from "child_process";
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
   * Realiza a busca por um termo (símbolo) no repositório.
   *
   * ESTRATÉGIA: Local Code Search (Grep)
   * Substituímos a API de Busca do GitHub (octokit.rest.search.code) por busca local.
   * MOTIVAÇÃO:
   * 1. Evitar Rate Limits da API de Busca (30 req/min).
   * 2. Evitar erros de depreciação da API de Busca do GitHub (Sun, 27 Sep 2026).
   * 3. Performance: Busca em disco local é muito mais rápida.
   * REQUISITO: O repositório deve ter sido clonado via `actions/checkout`.
   */
  public async searchCode(
    query: string,
  ): Promise<{ path: string; line: number }[]> {
    try {
      // Comando grep recursivo, ignorando arquivos binários e diretórios comuns de build/dependências
      // -r: recursivo | -I: ignorar binários | -l: apenas nomes de arquivos
      const excludeDirs = "{.git,node_modules,dist,bin,build,coverage}";
      const command = `grep -rIl "${query}" . --exclude-dir=${excludeDirs}`;

      try {
        const output = execSync(command, { encoding: "utf-8" });
        return output
          .trim()
          .split("\n")
          .filter((p) => p && p !== "")
          .map((p) => ({
            // Normaliza o caminho removendo o prefixo './' se existir
            path: p.startsWith("./") ? p.substring(2) : p,
            line: 1,
          }));
      } catch (grepError: any) {
        // O grep retorna exit code 1 quando não encontra nenhuma ocorrência.
        // Tratamos isso como "zero resultados", não como um erro fatal.
        if (grepError.status === 1) return [];
        throw grepError;
      }
    } catch (error) {
      logger.warn(
        `⚠️ Busca local falhou para '${query}'. Verifique se o código foi clonado no runner.`,
        error,
      );
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
