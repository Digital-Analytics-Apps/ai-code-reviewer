/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "octokit";
import { execSync } from "child_process";
import * as fs from "fs";
import { GithubReviewComment } from "../schemas/review.schema";
import { logger } from "../utils/logger";

/**
 * Serviço de Integração com GitHub.
 * Centraliza buscas de Diff, postagem de comentários e busca global de código.
 */
export class GithubService {
  private readonly SUMMARY_FINGERPRINT = "<!-- AI_CODE_REVIEW_SUMMARY -->";

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
      // -r: recursivo | -I: ignorar binários | -n: mostrar número da linha
      const excludeDirs = "{.git,node_modules,dist,bin,build,coverage}";
      const command = `grep -rIn "${query}" . --exclude-dir=${excludeDirs}`;

      try {
        const output = execSync(command, { encoding: "utf-8" });
        return output
          .trim()
          .split("\n")
          .filter((line) => line && line.includes(":"))
          .map((line) => {
            // Formato esperado do grep -n: ./caminho/arquivo:linha:conteúdo
            const parts = line.split(":");
            let filePath = parts[0];
            const lineNumber = parseInt(parts[1], 10);

            // Normaliza o caminho removendo o prefixo './' se existir
            if (filePath.startsWith("./")) {
              filePath = filePath.substring(2);
            }

            return {
              path: filePath,
              line: isNaN(lineNumber) ? 1 : lineNumber,
            };
          });
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
   * Posta ou atualiza o resumo geral do Pull Request (Upsert).
   * Usa um fingerprint oculto para identificar comentários anteriores do bot.
   */
  public async upsertSummaryComment(body: string): Promise<void> {
    try {
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.pullNumber,
      });

      const previousSummary = comments.find((c) =>
        c.body?.includes(this.SUMMARY_FINGERPRINT),
      );

      const finalBody = `${body}\n\n${this.SUMMARY_FINGERPRINT}`;

      if (previousSummary) {
        logger.info("🔄 Atualizando resumo anterior...");
        await this.octokit.rest.issues.updateComment({
          owner: this.owner,
          repo: this.repo,
          comment_id: previousSummary.id,
          body: finalBody,
        });
      } else {
        logger.info("📤 Criando novo resumo...");
        await this.octokit.rest.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: this.pullNumber,
          body: finalBody,
        });
      }
    } catch (error) {
      logger.error("❌ Falha ao realizar upsert do resumo:", error);
    }
  }

  /**
   * Remove comentários de revisão (inline) anteriores do bot para evitar spam.
   * Filtra por comentários que contenham o prefixo padrão do bot.
   */
  public async cleanPreviousReviews(): Promise<void> {
    try {
      logger.info("🧹 Limpando comentários de revisão anteriores do bot...");

      const { data: comments } =
        await this.octokit.rest.pulls.listReviewComments({
          owner: this.owner,
          repo: this.repo,
          pull_number: this.pullNumber,
        });

      const botComments = comments.filter((c) =>
        c.body.includes("🤖 **AI Bot:**"),
      );

      for (const comment of botComments) {
        try {
          await this.octokit.rest.pulls.deleteReviewComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: comment.id,
          });
        } catch {
          // Ignora se não conseguir deletar um comentário específico
        }
      }
    } catch (error) {
      logger.warn(
        "⚠️ Falha ao listar ou limpar comentários de revisão:",
        error,
      );
    }
  }

  /**
   * Busca o conteúdo bruto de um arquivo.
   * PRIORIDADE: Sistema de arquivos local (Runner).
   * FALLBACK: API do GitHub.
   */
  public async getFileContent(filePath: string): Promise<string> {
    try {
      // 1. Tenta ler localmente (mais rápido e evita rate limits)
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }

      // 2. Fallback para API do GitHub
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
      });

      if ("content" in data) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return "";
    } catch (error) {
      logger.debug(`⚠️ Falha ao ler arquivo ${filePath}: ${error}`);
      return "";
    }
  }
}
