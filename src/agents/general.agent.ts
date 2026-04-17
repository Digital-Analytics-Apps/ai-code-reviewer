import { BaseAgent } from "./base.agent.js";
import { AIService } from "../services/ai.service.js";

/**
 * Agente Generalista focado em Arquitetura, Clean Code e Performance.
 */
export class GeneralAgent extends BaseAgent {
  constructor(aiService: AIService) {
    super(aiService);
  }

  getName(): string {
    return "Principal Architect & Code Reviewer";
  }

  getGuidelines(): string {
    return `
1. Clean Code e Anti-Patterns:
- Critique de forma severa "Magic Numbers", funções com múltiplas responsabilidades e "Nesting" profundo (exija Early Returns).
- Sinalize o uso abusivo de tipagem frouxa ou a falta de contratos/schema claros.

2. Performance e Tráfego:
- Identifique N+1 Queries em Bancos de Dados.
- Critique renders pesados, loops aninhados desnecessários ou vazamentos de memória.

3. Taxonomia de Severidade:
- Use 🟡 SUGGESTION para refatorações e Clean Code.
- Use 🟢 NIT para detalhes pontuais de nomenclatura.
- Use ❓ QUESTION para dúvidas contextuais.
    `;
  }
}
