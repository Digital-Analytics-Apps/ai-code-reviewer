import { logger } from "../utils/logger";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

// ==========================================
// SERVIÇO: AIService (LangChain Powered)
// ==========================================

/**
 * Responsável por gerir a Inteligência Artificial usando LangChain.
 * Mantém compatibilidade com qualquer provedor OpenAI-Compatible.
 */
export class AIService {
  private readonly model: ChatOpenAI;

  constructor(apiKey: string, baseUrl: string, modelName: string) {
    this.model = new ChatOpenAI({
      apiKey: apiKey,
      configuration: {
        baseURL: baseUrl,
      },
      modelName: modelName,
      temperature: 0.2,
      maxRetries: 7,
    });
  }

  /**
   * Envia o prompt para a IA usando cadeias do LangChain.
   */
  async analyze(systemPrompt: string, userContent: string): Promise<string> {
    logger.info(`🤖 Calling AI Model via LangChain...`);

    // Escapamos chaves no systemPrompt para evitar que o LangChain tente interpretá-las como variáveis
    // No LangChain, {{ e }} são interpretados como literais { e }
    const escapedSystemPrompt = systemPrompt
      .replace(/{/g, "{{")
      .replace(/}/g, "}}");

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", escapedSystemPrompt],
      ["user", "{content}"],
    ]);

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser());

    try {
      return await chain.invoke({
        content: userContent,
      });
    } catch (error) {
      logger.error(`❌ AI Analysis failed: ${error}`);
      throw error;
    }
  }

  /**
   * Limpa o Markdown da resposta da IA.
   * Útil para extrair JSON de blocos de código.
   */
  cleanJson(text: string): string {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\n?/, "").replace(/```$/, "");
    }
    const match =
      cleaned.match(/\[\s*\{.*\}\s*\]/s) || cleaned.match(/\{\s*".*"\s*\}/s);
    return match ? match[0] : cleaned;
  }
}
