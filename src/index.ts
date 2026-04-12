import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import parseDiff from 'parse-diff';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

// Schemas de Dados
const ReviewCommentSchema = z.object({
  line: z.number(),
  message: z.string().min(1)
});
const ReviewArraySchema = z.array(ReviewCommentSchema);

interface GithubReviewComment {
  path: string;
  line: number;
  body: string;
  side: "RIGHT";
}

/**
 * SERVIÇO: GithubService
 */
class GithubService {
  constructor(private octokit: Octokit, private owner: string, private repo: string, private pullNumber: number) {}

  async fetchDiff(): Promise<string> {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: this.pullNumber,
      mediaType: { format: "diff" },
    });
    return data as unknown as string;
  }

  async postComment(body: string) {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.pullNumber,
      body
    });
  }

  async postReviewBatches(reviews: GithubReviewComment[]) {
    const CHUNK_SIZE = 50;
    const totalBatches = Math.ceil(reviews.length / CHUNK_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = reviews.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      core.info(`📦 Enviando lote ${i + 1}/${totalBatches}...`);

      await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.pullNumber,
        event: "COMMENT",
        body: `🤖 **Análise do Gemini 3.1 Flash (Parte ${i + 1}/${totalBatches})**\n\nTotal de pontos identificados: ${reviews.length}.`,
        comments: batch,
      });

      if (totalBatches > 1 && i < totalBatches - 1) {
        await new Promise(res => setTimeout(res, 2000));
      }
    }
  }
}

/**
 * SERVIÇO: GeminiService
 */
class GeminiService {
  constructor(private model: GenerativeModel) {}

  async analyze(prompt: string): Promise<string> {
    const result = await this.withRetry(() => this.model.generateContent(prompt));
    return result.response.text();
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        const isRetryable = error.status === 503 || error.status === 429 || error.message?.includes("high demand");
        if (!isRetryable || i === maxRetries - 1) throw error;
        const delay = 2000 * Math.pow(2, i);
        core.warning(`⚠️ Erro na API (Tentativa ${i + 1}). Retentando em ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
    throw new Error("Falha após retentativas");
  }

  cleanJson(text: string): string {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\n?/, "").replace(/```$/, "");
    }
    const match = cleaned.match(/\[\s*\{.*\}\s*\]/s);
    return match ? match[0] : cleaned;
  }
}

async function getGuidelines(filePath: string): Promise<string> {
  const generic = "Siga principios de Clean Code e OWASP de Segurança Geral.";
  let type: "FRONTEND" | "BACKEND" | undefined;
  
  if (filePath.startsWith("frontend") || filePath.includes("react") || filePath.includes("components")) type = "FRONTEND";
  else if (filePath.startsWith("backend") || filePath.includes("prisma") || filePath.includes("api") || filePath.includes("services")) type = "BACKEND";
  
  if (!type) return generic;
  
  try {
    // Tenta ler regras customizadas do proprio repositorio onde a action foi instalada
    const rulesPath = path.join(process.cwd(), `.github/ai-rules/${type}.md`);
    return await fs.readFile(rulesPath, "utf-8");
  } catch {
    core.info(`ℹ️ Nenhuma diretriz local encontrada em .github/ai-rules/${type}.md. Utilizando regras globais defaults para ${type}.`);
    return generic;
  }
}

async function run() {
  try {
    // 1. Inputs seguros via GitHub Actions Core
    const githubToken = core.getInput('github_token', { required: true });
    const geminiKey = core.getInput('gemini_api_key', { required: true });
    
    // 2. Mascara do Segredo nos logs (Garante q a Action NUNCA vazará a api key)
    core.setSecret(geminiKey);

    // 3. Pegar Contexto Automaticamente (Sem precisar de env vars para owner/repo/PR)
    const context = github.context;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    
    const pullNumber = context.payload.pull_request?.number || context.payload.issue?.number;
    
    if (!pullNumber) {
      core.warning("⚠️ Action executada fora de um contexto de Pull Request. Abortando com sucesso.");
      return;
    }

    core.info(`🤖 Iniciando AI Code Reviewer na PR #${pullNumber} para ${owner}/${repo}`);

    const ghService = new GithubService(new Octokit({ auth: githubToken }), owner, repo, pullNumber);
    const gemini = new GeminiService(new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" }));

    const diffString = await ghService.fetchDiff();
    if (diffString.length > 200000) {
      core.warning("⚠️ Aviso: Diff muito grande para análise automática (Limite 200.000 chars).");
      await ghService.postComment("⚠️ **Aviso:** Diff muito grande para análise automática. A IA abortou a sessão para economia de segurança de rede.");
      return;
    }

    const files = parseDiff(diffString);
    const allReviews: GithubReviewComment[] = [];
    
    const getValidLines = (chunk: parseDiff.Chunk): Set<number> => {
      const lines = chunk.changes
        .filter((c): c is parseDiff.AddChange => c.type === 'add')
        .map(c => c.ln);
      return new Set(lines);
    };

    const tasks: (() => Promise<void>)[] = [];

    for (const file of files) {
      if (!file.to || file.to === "/dev/null") continue;
      if (["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".env", ".github", "dist", "build"].some(p => file.to?.includes(p))) continue;

      const guidelines = await getGuidelines(file.to);

      for (const chunk of file.chunks) {
        tasks.push(async () => {
          const validLines = getValidLines(chunk);
          if (validLines.size === 0) return; // Nenhuma linha alterada
          
          const diffContent = chunk.changes.map(c => (c.type === 'add' ? '+' : c.type === 'del' ? '-' : ' ') + c.content).join('\n');
          const prompt = `Analise detalhadamente este diff no arquivo ${file.to}. Siga estas regras: ${guidelines}\n\nDiff:\n${diffContent}\n\nRetorne estritamente um JSON: [{"line": number, "message": string}] caso encontre sugestões relevantes de clean code, segurança ou performance. Ou retorne "OK" em CAIXA ALTA se tudo estiver impecável sem sugestões vitais.`;

          try {
            const response = await gemini.analyze(prompt);
            if (response.trim().toUpperCase() === "OK") return;

            let rawJson;
            try {
              rawJson = JSON.parse(gemini.cleanJson(response));
            } catch (jsonErr) {
              core.warning(`⚠️ Aviso: Falha ao fazer parse do JSON em ${file.to}. A IA respondeu: ${response}`);
              return;
            }

            const validated = ReviewArraySchema.safeParse(rawJson);
            if (validated.success) {
              validated.data.forEach(c => {
                if (validLines.has(c.line)) {
                  allReviews.push({ path: file.to!, line: c.line, body: `🤖 **AI Bot:** ${c.message}`, side: "RIGHT" });
                }
              });
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            core.error(`❌ Erro processando ${file.to}: ${msg}`);
          }
        });
      }
    }

    core.info(`🧠 Realizando análise em ${tasks.length} blocos com concorrência controlada...`);
    
    // Concurrency Limit logic to obey Rate Limiting of external API
    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
      const batch = tasks.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(batch.map(task => task()));
    }

    if (allReviews.length > 0) {
      await ghService.postReviewBatches(allReviews);
    } else {
      core.info("✨ Tudo limpo! Nenhuma sugestão postada.");
    }

  } catch (error) {
    const e = error as Error;
    core.setFailed(`💥 Falha fatal do Revisor IA: ${e.message}`);
  }
}

run();
