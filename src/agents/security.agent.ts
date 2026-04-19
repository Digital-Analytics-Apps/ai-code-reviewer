import { BaseAgent } from "./base.agent.js";
import { AIService } from "../services/ai.service.js";
import { SECURITY_PROMPT } from "../guidelines/prompts/security.prompt.js";

/**
 * Agente especializado em Segurança (OWASP, Secrets, Leaks).
 */
export class SecurityAgent extends BaseAgent {
  constructor(aiService: AIService) {
    super(aiService);
  }

  getName(): string {
    return "Security Officer Agent";
  }

  getGuidelines(): string {
    return SECURITY_PROMPT;
  }
}
