/* eslint-disable @typescript-eslint/no-explicit-any */
import parseDiffLib from "parse-diff";

/**
 * Re-exporta a funcionalidade de parsing de forma chamável.
 */
export const parseDiff = parseDiffLib;

// ==========================================
// UTILITÁRIOS DE PROCESSAMENTO DE DIFF
// ==========================================

/**
 * Padrões de arquivos que devem ser ignorados durante a revisão.
 */
export const IGNORED_FILE_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".env",
  "dist",
  "build",
  ".github",
  "prisma/migrations",
  "migration.sql",
  "docs/",
  ".md",
  ".agent/",
  "__snapshots__",
];

export function isIgnoredFile(filePath: string): boolean {
  return IGNORED_FILE_PATTERNS.some((pattern) => filePath.includes(pattern));
}

export function getValidLines(chunk: any): Set<number> {
  const lines = (chunk.changes || [])
    .filter((c: any) => c.type === "add")
    .map((c: any) => c.ln);
  return new Set(lines);
}

export function buildDiffContent(chunk: any): string {
  return (chunk.changes || [])
    .map(
      (c: any) =>
        (c.type === "add" ? "+" : c.type === "del" ? "-" : " ") + c.content,
    )
    .join("\n");
}

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
