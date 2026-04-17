import { BaseAgent } from "./base.agent.js";
import { AIService } from "../services/ai.service.js";

/**
 * Agente especializado em Segurança (OWASP, Secrets, Leaks).
 */
export class SecurityAgent extends BaseAgent {
  constructor(aiService: AIService) {
    super(aiService);
  }

  getName(): string {
    return "Security Officer Agent (OWASP Specialist)";
  }

  getGuidelines(): string {
    return `
- Rejeite inputs não sanitizados que podem levar a XSS ou SQL Injection.
- Identifique a exposição de secrets, chaves de API, senhas ou tokens hardcoded.
- Verifique vulnerabilidades clássicas de permissão e Mass Assignment.
- Critique o uso de bibliotecas de criptografia obsoletas ou configurações de segurança frouxas.
- Foque estritamente em riscos de segurança iminentes.
- Use o prefixo 🔴 BLOCKING para falhas graves.
    `;
  }
}
