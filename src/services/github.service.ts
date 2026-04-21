/* eslint-disable @typescript-eslint/no-explicit-any */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { Octokit } from "octokit";
import { GithubReviewComment } from "../schemas/review.schema";
import { logger } from "../utils/logger";

/**
 * Serviço de Integração com GitHub.
 * Centraliza buscas de Diff, postagem de comentários e busca global de código.
 */
export class GithubService {
  private readonly SUMMARY_FINGERPRINT = "<!-- AI_CODE_REVIEW_SUMMARY -->";

  constructor(
    private readonly octokit: Octokit,
    private readonly owner: string,
    private readonly repo: string,
    private readonly pullNumber: number,
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
        body: `🤖 **AI Code Review (Part ${i + 1}/${totalBatches})**\n\nTotal de achados: ${reviews.length}.\n\n<!-- AI_BOT_REVIEW_HEADER -->`,
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
            const lineNumber = Number.parseInt(parts[1], 10);

            // Normaliza o caminho removendo o prefixo './' se existir
            if (filePath.startsWith("./")) {
              filePath = filePath.substring(2);
            }

            return {
              path: filePath,
              line: Number.isNaN(lineNumber) ? 1 : lineNumber,
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
   * Remove comentários de revisão (inline) e revisões anteriores do bot para evitar spam.
   */
  public async cleanPreviousReviews(): Promise<void> {
    try {
      logger.info("🧹 Limpando revisões e comentários anteriores do bot...");

      // 1. Limpa comentários inline
      const { data: comments } =
        await this.octokit.rest.pulls.listReviewComments({
          owner: this.owner,
          repo: this.repo,
          pull_number: this.pullNumber,
        });

      const botComments = comments.filter(
        (c) =>
          c.body.includes("🤖 **AI Bot:**") ||
          c.body.includes("🤖 **AI Code Review"),
      );

      for (const comment of botComments) {
        try {
          await this.octokit.rest.pulls.deleteReviewComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: comment.id,
          });
        } catch {
          // Ignora se já foi deletado (ex: deletado junto com a revisão)
        }
      }

      // 2. Limpa os cabeçalhos das revisões (Summaries na timeline)
      const { data: reviews } = await this.octokit.rest.pulls.listReviews({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.pullNumber,
      });

      const botReviews = reviews.filter(
        (r) =>
          r.body?.includes("🤖 **AI Code Review") ||
          r.body?.includes("<!-- AI_BOT_REVIEW_HEADER -->"),
      );

      for (const review of botReviews) {
        try {
          if (review.state === "PENDING") {
            await this.octokit.rest.pulls.deletePendingReview({
              owner: this.owner,
              repo: this.repo,
              pull_number: this.pullNumber,
              review_id: review.id,
            });
          } else if (review.body && !review.body.includes("substituída")) {
            // Para revisões já submetidas, atualizamos o corpo para reduzir ruído na timeline
            await this.octokit.rest.pulls.updateReview({
              owner: this.owner,
              repo: this.repo,
              pull_number: this.pullNumber,
              review_id: review.id,
              body: "🗑️ _Esta análise foi substituída por uma versão mais recente._",
            });
          }
        } catch (error) {
          logger.debug(
            `⚠️ Não foi possível limpar review ${review.id}:`,
            error,
          );
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
