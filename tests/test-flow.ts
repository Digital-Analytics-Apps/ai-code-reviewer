import { AgentOrchestrator } from "../src/services/agent.orchestrator";
import { AIService } from "../src/services/ai.service";

class MockAIService extends AIService {
  constructor() {
    super("mock-key", "mock-url", "mock-model");
  }

  async analyze(systemPrompt: string, userContent: string): Promise<string> {
    console.log(`   [AI CALL] System Prompt: ${systemPrompt.substring(0, 50).replace(/\n/g, ' ')}...`);
    
    // Verifica se a regra customizada chegou no prompt
    if (systemPrompt.includes("PROIBIDO_PRINT")) {
      return JSON.stringify([{ line: 2, message: "Regra Customizada Violada: O uso de 'print' é proibido neste repo. (MOCK)" }]);
    }

    if (systemPrompt.includes("Dispatcher")) {
      return JSON.stringify({
        language: "python",
        agents: ["security", "general"],
        reasoning: "Lógica detectada via Mock AI"
      });
    }

    if (systemPrompt.includes("Security Officer")) {
      return JSON.stringify([{ line: 1, message: "Possível vazamento de chave detectado (MOCK)." }]);
    }

    return "[]";
  }

  cleanJson(text: string): string {
    return text.trim();
  }
}

async function runFlowTest() {
  console.log("🚀 Teste de Fluxo: AgentOrchestrator + Custom Rules\n");

  const customRules = "REGRAS: PROIBIDO_PRINT";
  const mockAI = new MockAIService();
  const orchestrator = new AgentOrchestrator(mockAI, customRules);

  const file = "src/main.py";
  const diff = `+ apiKey = "123456"\n+ print("Hello World")`;
  const validLines = new Set([1, 2]);

  console.log(`📝 Simulando revisão do arquivo: ${file}`);
  console.log("--------------------------------------------------");

  const reviews = await orchestrator.reviewChunk(file, "main.py", diff, validLines);

  console.log("\n📊 Resultado Final:");
  reviews.forEach(r => {
    console.log(`   📍 Linha ${r.line}: ${r.body}`);
  });

  console.log("\n✅ Teste finalizado.");
}

runFlowTest().catch(console.error);
