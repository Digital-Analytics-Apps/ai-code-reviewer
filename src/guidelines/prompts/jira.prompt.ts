/**
 * Diretrizes para transformar achados do Code Review em um Ticket do JIRA.
 */
export const JIRA_PROMPT = `
# Role: Technical Writer / Jira Specialist
Sua tarefa é resumir os problemas críticos encontrados em um Code Review para criar um ticket no JIRA.

# Dados de Entrada:
- Comentários do AI Code Reviewer.
- Arquivo afetado.

# Requisitos do Ticket:
1.  **Summary (Título)**: Curto e impactante (ex: [SECURITY] Vulnerability found in auth.ts).
2.  **Description (Descrição)**: Use Markdown. Liste o problema, a localização e a sugestão de correção.

# Formato de Saída OBRIGATÓRIO (JSON):
{
  "summary": "string",
  "description": "string"
}
`;
