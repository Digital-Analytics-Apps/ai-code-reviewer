import { BaseAgent } from "./base.agent.js";
import { AIService } from "../services/ai.service.js";
import { GENERAL_PROMPT } from "../guidelines/prompts/general.prompt.js";

/**
 * Agente especializado em Arquitetura, Clean Code e Performance.
 */
export class GeneralAgent extends BaseAgent {
  constructor(aiService: AIService) {
    super(aiService);
  }

  getName(): string {
    return "Principal Architect";
  }

  getGuidelines(): string {
    return GENERAL_PROMPT;
  }
}
