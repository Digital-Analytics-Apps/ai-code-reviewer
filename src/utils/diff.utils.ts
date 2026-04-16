import parseDiff from "parse-diff";

// ==========================================
// UTILITÁRIOS DE PROCESSAMENTO DE DIFF
// ==========================================

/**
 * Padrões de arquivos que devem ser ignorados durante a revisão.
 * Inclui lock files, artefatos de build, arquivos de ambiente,
 * configurações geradas automaticamente, migrations SQL,
 * documentação e arquivos de configuração de agentes.
 */
export const IGNORED_FILE_PATTERNS = [
  // Dependency locks
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  // Environment & secrets
  ".env",
  // Build artifacts
  "dist",
  "build",
  // CI/CD configs (não precisam de revisão de lógica)
  ".github",
  // Database migrations (geradas automaticamente pelo Prisma)
  "prisma/migrations",
  "migration.sql",
  // Documentação (Markdown, not code)
  "docs/",
  ".md",
  // Agent rules/config files
  ".agent/",
  // Test snapshots
  "__snapshots__",
];

/**
 * Verifica se um arquivo deve ser ignorado na revisão,
 * com base nos padrões de IGNORED_FILE_PATTERNS.
 */
export function isIgnoredFile(filePath: string): boolean {
  return IGNORED_FILE_PATTERNS.some((pattern) => filePath.includes(pattern));
}

/**
 * Retorna um Set com os números das linhas que foram ADICIONADAS no chunk.
 *
 * Só podemos comentar nas linhas que foram efetivamente EDITADAS
 * e existem do lado "direito" do diff (type === "add").
 * O próprio GitHub bloqueia com HTTP 422 qualquer comentário
 * em linha não-existente no diff.
 */
export function getValidLines(chunk: parseDiff.Chunk): Set<number> {
  const lines = chunk.changes
    .filter((c): c is parseDiff.AddChange => c.type === "add")
    .map((c) => c.ln);
  return new Set(lines); // O Set assegura exclusividade, sem repetições.
}

/**
 * Formata as mudanças de um chunk em uma string legível de diff,
 * prefixando cada linha com "+", "-" ou " " de acordo com o tipo.
 */
export function buildDiffContent(chunk: parseDiff.Chunk): string {
  return chunk.changes
    .map(
      (c) =>
        (c.type === "add" ? "+" : c.type === "del" ? "-" : " ") + c.content,
    )
    .join("\n");
}

/**
 * Monta o prompt de revisão completo que será enviado para a IA.
 * Combina o contexto do arquivo, as diretrizes e o conteúdo do diff.
 */
export function buildReviewPrompt(
  fileName: string,
  guidelines: string,
  diffContent: string,
): string {
  return `Analise detalhadamente este diff no arquivo ${fileName}. 
          
Siga estas regras orientadoras: 
${guidelines}

Diff do Arquivo:
${diffContent}

Instruções Formatação:
Retorne estritamente um JSON Array deste formato: [{"line": number, "message": string}].
- Só crie um review se encontrar problemas relevantes nas linhas alteradas, referentes à clean code, falhas de lógica ou segurança grave.
- Ou retorne "OK" em CAIXA ALTA puro sem Markdown se tudo estiver impecável e sem problemas.`;
}
