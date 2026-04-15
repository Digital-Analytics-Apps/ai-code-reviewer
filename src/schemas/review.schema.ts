import { z } from "zod";

// ==========================================
// SCHEMAS DE VALIDAÇÃO (ZOD)
// ==========================================
// O Zod nos ajuda a garantir que o JSON retornado pela IA tenha o formato exato
// que o GitHub exige para criar um comentário em uma linha específica.

/**
 * Schema de um único comentário retornado pela IA.
 * Valida que cada item do array tenha: linha (number) e mensagem (string não-vazia).
 */
export const ReviewCommentSchema = z.object({
  line: z.number(), // A linha no arquivo alterado onde o comentário vai ficar
  message: z.string().min(1), // O texto do comentário em si
});

/**
 * Schema da resposta completa da IA.
 * A resposta deve ser sempre um Array de ReviewComments.
 */
export const ReviewArraySchema = z.array(ReviewCommentSchema);

/**
 * Interface que dita o formato exato que a API REST do GitHub
 * precisa receber para criar um comentário inline em um Pull Request.
 */
export interface GithubReviewComment {
  path: string;
  line: number;
  body: string;
  side: "RIGHT"; // RIGHT indica que o comentário vai na linha "nova" do diff
}
