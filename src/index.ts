import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import parseDiff from 'parse-diff';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

// ==========================================
// 1. SCHEMAS DE VALIDAÇÃO (ZOD)
// ==========================================
// O Zod nos ajuda a garantir que o JSON retornado pela IA tenha o formato exato
// que o GitHub exige para criar um comentário em uma linha específica.
const ReviewCommentSchema = z.object({
  line: z.number(), // A linha no arquivo alterado onde o comentário vai ficar
  message: z.string().min(1) // O texto do comentário em si
});

// A resposta da IA deve ser sempre uma lista/array destes comentários
const ReviewArraySchema = z.array(ReviewCommentSchema);

// Esta é a interface que dita o formato que a API do GitHub precisa receber
interface GithubReviewComment {
  path: string;
  line: number;
  body: string;
  side: "RIGHT"; // RIGHT indica que o comentário vai na linha "nova" do diff
}

// ==========================================
// 2. SERVIÇOS ACOPLADOS (PATTERN: WRAPPER)
// ==========================================
/**
 * SERVIÇO: GithubService
 * Responsável por toda a comunicação com a API REST do GitHub.
 * Separa a lógica do GitHub do script principal.
 */
class GithubService {
  constructor(private octokit: Octokit, private owner: string, private repo: string, private pullNumber: number) {}

  // Puxa o "Diff" (texto que mostra as linhas apagadas em vermelho e adicionadas em verde) do PR inteiro.
  async fetchDiff(): Promise<string> {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: this.pullNumber,
      // Passando mediaType: "diff" nós enganamos o GitHub pra retornar o diff bruto como texto, ao invés de um JSON do PR.
      mediaType: { format: "diff" },
    });
    return data as unknown as string;
  }

  // Faz um comentário solto no histórico do PR (útil para Erros ou Avisos da Action)
  async postComment(body: string) {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.pullNumber,
      body
    });
  }

  // Envia todos os comentários que a IA fez de uma vez, mas com paginação
  // para evitar quebrar limites da API do GitHub.
  async postReviewBatches(reviews: GithubReviewComment[]) {
    const CHUNK_SIZE = 50; // O github aguenta bem 50 comentários por revisão global
    const totalBatches = Math.ceil(reviews.length / CHUNK_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = reviews.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      core.info(`📦 Enviando lote ${i + 1}/${totalBatches}...`);

      await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.pullNumber,
        event: "COMMENT", // "COMMENT" envia sem aprovar ou reprovar a PR explicitamente.
        body: `🤖 **Análise do Gemini 3.1 Flash (Parte ${i + 1}/${totalBatches})**\n\nTotal de pontos identificados: ${reviews.length}.`,
        comments: batch, // Aqui injetamos as notas inline no código
      });

      // Pausa estratégica de 2s pra respeitar o Rate Limit do GitHub se precisarmos enviar vários blocos
      if (totalBatches > 1 && i < totalBatches - 1) {
        await new Promise(res => setTimeout(res, 2000));
      }
    }
  }
}

/**
 * SERVIÇO: GeminiService
 * Responsável por gerir a Inteligência Artificial e mitigar falhas da API com Retentativas.
 */
class GeminiService {
  constructor(private model: GenerativeModel) {}

  // Envia o prompt de forma simples usando a função interna de retry
  async analyze(prompt: string): Promise<string> {
    const result = await this.withRetry(() => this.model.generateContent(prompt));
    return result.response.text();
  }

  // Se a API da Google cair ou recusar por limite, essa função automaticamente 
  // tenta de novo com "Backoff Exponencial" (espera 2s, depois 4s, depois 8s...)
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        // Status 503 e 429 = Serviço indisponível ou Too Many Requests (erros temporários comuns de IA)
        const isRetryable = error.status === 503 || error.status === 429 || error.message?.includes("high demand");
        if (!isRetryable || i === maxRetries - 1) throw error;
        
        const delay = 2000 * Math.pow(2, i);
        core.warning(`⚠️ Erro na API (Tentativa ${i + 1}). Retentando em ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
    throw new Error("Falha após retentativas");
  }

  // Faz a faxina do MarkDown: Se a IA retornar "```json [...] ```", pegamos só os colchetes
  cleanJson(text: string): string {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\n?/, "").replace(/```$/, "");
    }
    const match = cleaned.match(/\[\s*\{.*\}\s*\]/s);
    return match ? match[0] : cleaned;
  }
}

// ==========================================
// 3. RECUPERAÇÃO DE CONTEXTO E REGRAS MATRIZES
// ==========================================
// Se o projeto-alvo não possuir um .github/ai-rules personalizado, a IA usará este 
// "Prompt de Sistema" mestre herdado das nossas Skills de Code Review e Clean Code.
const MASTER_GUIDELINES = `
# Diretrizes Universais de Code Review Mestre
Você é um Engenheiro de Software Sênior especializado em Code Review Sistêmico. 
Ao analisar o diff, foque em 4 pilares Rigorosos:

1. Segurança (OWASP):
- Rejeite inputs não sanitizados, vulnerabilidades clássicas (XSS, SQLi), keys hardcoded e Mass Assignment.

2. Clean Code e Anti-Patterns:
- Critique de forma severa "Magic Numbers", funções com múltiplas responsabilidades e "Nesting" profundo (exija Early Returns).
- Sinalize o uso abusivo de "any[]" ou tipagem frouxa no TypeScript.

3. Performance e Tráfego:
- Identifique N+1 Queries em Bancos de Dados.
- Critique renders pesados ou loops aninhados desnecessários.

4. Taxonomia Obrigatória da Resposta:
Prefixe cada comentário seu (no campo message) com a severidade apropriada:
- 🔴 BLOCKING: Para riscos de segurança iminentes ou bugs crônicos visíveis.
- 🟡 SUGGESTION: Para refatorações, Débito Técnico e Clean Code.
- 🟢 NIT: Para detalhes pontuais de nomenclatura ou linting mental.
- ❓ QUESTION: Para dúvidas contextuais ("Esse timeout de 50s é intencional?").
`;

// Lê as regras de projeto se a pasta .github/ai-rules existir no repositório analisado.
// Retorna a regra do repo ou a regra MASTER_GUIDELINES fundida.
async function getGuidelines(filePath: string): Promise<string> {
  const generic = MASTER_GUIDELINES;
  let type: "FRONTEND" | "BACKEND" | undefined;
  
  // Tenta classificar o escopo baseando na pasta do arquivo modificado
  if (filePath.startsWith("frontend") || filePath.includes("react") || filePath.includes("components")) type = "FRONTEND";
  else if (filePath.startsWith("backend") || filePath.includes("prisma") || filePath.includes("api") || filePath.includes("services")) type = "BACKEND";
  
  if (!type) return generic;
  
  try {
    // Tenta ler o arquivo localmente
    const rulesPath = path.join(process.cwd(), `.github/ai-rules/${type}.md`);
    const customRules = await fs.readFile(rulesPath, "utf-8");
    // FUSÂO DE REGRA MESTRE + REGRA REPOSITÓRIO:
    return `Regras Nativas do Repositório: \n${customRules}\n\nAlém disso, aplique esta baseline absoluta:\n${MASTER_GUIDELINES}`;
  } catch {
    core.info(`ℹ️ Nenhuma diretriz local encontrada em .github/ai-rules/${type}.md. Utilizando regras globais defaults para ${type}.`);
    return generic;
  }
}

// ==========================================
// 4. FUNÇÃO PRINCIPAL (ENTRYPOINT)
// ==========================================
async function run() {
  try {
    // [INPUTS] core.getInput() é a forma que Actions pega os valores colocados no YAML (uses: with:)
    const githubToken = core.getInput('github_token', { required: true });
    const geminiKey = core.getInput('gemini_api_key', { required: true });
    
    // [SAFETY] Isso informa ao GitHub para censurar a GeminiKey caso tentem dar console.log nela = ***
    core.setSecret(geminiKey);

    // [CONTEXTO] Extrai os dados em qual PR ou Repo esta Action tá rodando no momento
    const context = github.context;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    
    // Pode vir de um 'pull_request.opened' ou de um comentário de 'issue_comment'
    const pullNumber = context.payload.pull_request?.number || context.payload.issue?.number;
    
    // Fail-fast se chamarem o action num evento que não rola em Pull Request.
    if (!pullNumber) {
      core.warning("⚠️ Action executada fora de um contexto de Pull Request. Ignorando silenciosamente.");
      return;
    }

    core.info(`🤖 Iniciando AI Code Reviewer na PR #${pullNumber} para ${owner}/${repo}`);

    // Inicializa instâncias com as credenciais
    const ghService = new GithubService(new Octokit({ auth: githubToken }), owner, repo, pullNumber);
    const gemini = new GeminiService(new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" }));

    // [FASE DIFF] Puxa todas as modificações...
    const diffString = await ghService.fetchDiff();
    
    // Trava de segurança para limites da IA context-window.
    if (diffString.length > 200000) {
      core.warning("⚠️ Aviso: Diff muito grande para análise automática (Limite 200.000 chars).");
      await ghService.postComment("⚠️ **Aviso:** O Diff é muito gigantesco para a IA analisar sem estourar custos/memória. Revisão manual obrigatória.");
      return;
    }

    // `parseDiff` "pica" toda a string gigante do git diff separando logicamente em Array[Arquivos[Blocos[Alteracoes]]]
    const files = parseDiff(diffString);
    const allReviews: GithubReviewComment[] = [];
    
    // Helper p/ pegar só as linhas que as regras do Github deixam as Actions comentar: 
    // Só podemos comentar nas linhas que foram efetivamente EDITADAS e existem do lado "direito" do diff
    const getValidLines = (chunk: parseDiff.Chunk): Set<number> => {
      const lines = chunk.changes
        .filter((c): c is parseDiff.AddChange => c.type === 'add')
        .map(c => c.ln);
      return new Set(lines); // O 'Set' assegura a exclusividade, sem repetições.
    };

    // Fila paralela
    const tasks: (() => Promise<void>)[] = [];

    // [MONTAGEM DAS TAREFAS DE IA]
    for (const file of files) {
      if (!file.to || file.to === "/dev/null") continue;
      
      // Filtra arquivos automatizados ou minificados
      if (["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".env", ".github", "dist", "build"].some(p => file.to?.includes(p))) continue;

      const guidelines = await getGuidelines(file.to);

      for (const chunk of file.chunks) {
        tasks.push(async () => {
          const validLines = getValidLines(chunk);
          if (validLines.size === 0) return; // Nenhuma linha alterada onde a Action possa comentar, pula.
          
          const diffContent = chunk.changes.map(c => (c.type === 'add' ? '+' : c.type === 'del' ? '-' : ' ') + c.content).join('\n');
          const prompt = `Analise detalhadamente este diff no arquivo ${file.to}. 
          
Siga estas regras orientadoras: 
${guidelines}

Diff do Arquivo:
${diffContent}

Instruções Formatação:
Retorne estritamente um JSON Array deste formato: [{"line": number, "message": string}].
- Só crie um review se encontrar problemas relevantes nas linhas alteradas, referentes à clean code, falhas de lógica ou segurança grave.
- Ou retorne "OK" em CAIXA ALTA puro sem Markdown se tudo estiver impecável e sem problemas.`;

          try {
            // Chamamos a LLM efetiva
            const response = await gemini.analyze(prompt);
            
            if (response.trim().toUpperCase() === "OK") return;

            let rawJson;
            try {
              rawJson = JSON.parse(gemini.cleanJson(response));
            } catch (jsonErr) {
              core.warning(`⚠️ Falha ao fazer parser do JSON no arquivo ${file.to}. Resposta bruta descartada.`);
              return;
            }

            // O schema valida se recebemos exatamente um array com object properties: {line, message}
            const validated = ReviewArraySchema.safeParse(rawJson);
            
            if (validated.success) {
              validated.data.forEach(c => {
                // Checagem Dupla Crítica: Se não validar if a linha informada pelo robô
                // foi editada e está na lista de ValidLines, o próprio GitHub bloqueia o request com HTTP 422
                if (validLines.has(c.line)) {
                  allReviews.push({ path: file.to!, line: c.line, body: `🤖 **AI Bot:** ${c.message}`, side: "RIGHT" });
                }
              });
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            core.error(`❌ Falha mapeando ${file.to}: ${msg}`);
          }
        });
      }
    }

    core.info(`🧠 Processaremos um total de ${tasks.length} blocos de código usando paralelismo controlado...`);
    
    // [EXECUÇÃO ASSÍNCRONA CONTROLADA]
    // Se enviarmos 50 arquivos para o Gemini no mesmo milésimo de segundo, o IP e a cota limitam e bloqueiam.
    // Lote de 'concorrência == 5' faz andar de 5 em 5 para fluidez segura.
    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
      const batch = tasks.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(batch.map(task => task()));
    }

    // [FINALIZAÇÃO]
    if (allReviews.length > 0) {
      await ghService.postReviewBatches(allReviews);
    } else {
      core.info("✨ Tudo limpo e inspecionado com sucesso! O código não exigiu modificações.");
    }

  } catch (error) {
    // Captura Erro Supremo: core.setFailed joga uma 'marcação em vermelho(X)' e causa falha na esteira CI
    const e = error as Error;
    core.setFailed(`💥 Falha fatal do Action Revisor: ${e.message}`);
  }
}

// Inicia a Action e não deixa as Promise pendentes de forma segura.
run();
