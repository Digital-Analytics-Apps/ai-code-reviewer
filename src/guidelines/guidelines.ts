import * as core from "@actions/core";
import fs from "fs/promises";
import path from "path";

// ==========================================
// DIRETRIZES MESTRAS (MASTER GUIDELINES)
// ==========================================

/**
 * Prompt de Sistema padrão aplicado quando o projeto-alvo não possui
 * um arquivo de regras customizadas (.github/ai-reviewer-rules.md).
 *
 * Baseado em princípios OWASP, Clean Code e análise de performance.
 */
export const MASTER_GUIDELINES = `
# Diretrizes Universais de Code Review Mestre
Você é um Engenheiro de Software Sênior especializado em Code Review Sistêmico. 
Ao analisar o diff, foque em 4 pilares Rigorosos:

1. Segurança (OWASP):
- Rejeite inputs não sanitizados, vulnerabilidades clássicas (XSS, SQLi), keys hardcoded e Mass Assignment.

2. Clean Code e Anti-Patterns:
- Critique de forma severa "Magic Numbers", funções com múltiplas responsabilidades e "Nesting" profundo (exija Early Returns).
- Sinalize o uso abusivo de tipagem frouxa em linguagens tipadas, ou a falta de contratos/schema claros onde for aplicável.

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

// Caminhos padrão onde a Action busca por regras customizadas do repositório-alvo.
const DEFAULT_RULES_PATHS = [
  ".github/ai-reviewer-rules.md",
  "ai-reviewer-rules.md",
];

// ==========================================
// CARREGADOR DE DIRETRIZES
// ==========================================

/**
 * Carrega e combina as diretrizes de revisão seguindo a cadeia de prioridade:
 *
 * 1. `custom_rules` (inline no YAML do workflow) — maior prioridade
 * 2. `rules_path`   (caminho explícito para um arquivo .md)
 * 3. `.github/ai-reviewer-rules.md` (arquivo padrão do repositório)
 * 4. `MASTER_GUIDELINES` (fallback universal) — menor prioridade
 */
export async function getGuidelines(
  customRulesInput: string,
  rulesPathInput: string,
): Promise<string> {
  const additionalRules = customRulesInput
    ? `Custom Rules from Action Input: \n${customRulesInput}\n\n`
    : "";

  let customFileRules = "";

  // 1. Tenta carregar do rules_path passado explicitamente via Workflow YAML
  if (rulesPathInput) {
    try {
      const explicitPath = path.join(process.cwd(), rulesPathInput);
      customFileRules = await fs.readFile(explicitPath, "utf-8");
      core.info(`ℹ️ Loading guidelines from specified file: ${rulesPathInput}`);
    } catch {
      core.warning(
        `⚠️ Rules file not found at: ${rulesPathInput}. Please check the path.`,
      );
    }
  }

  // 2. Fallback: Busca o arquivo de regras padrão na raiz do repositório
  if (!customFileRules && !rulesPathInput) {
    for (const p of DEFAULT_RULES_PATHS) {
      try {
        const fullPath = path.join(process.cwd(), p);
        customFileRules = await fs.readFile(fullPath, "utf-8");
        core.info(`ℹ️ Successfully loaded global guidelines from ${p}`);
        break; // Achou, sai do loop
      } catch {
        // Ignora e tenta o próximo caminho
      }
    }
  }

  // 3. Monta as diretrizes finais combinando todas as fontes
  if (additionalRules || customFileRules) {
    return (
      `${additionalRules}` +
      `${customFileRules ? `Repository Native Rules: \n${customFileRules}\n\n` : ""}` +
      `Furthermore, apply this absolute baseline:\n${MASTER_GUIDELINES}`
    );
  }

  return MASTER_GUIDELINES;
}
