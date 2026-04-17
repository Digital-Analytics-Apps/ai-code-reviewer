import { AgentOrchestrator } from "../src/services/agent.orchestrator";
import { AIService } from "../src/services/ai.service";

/**
 * Mock Simples do AIService para não gastar tokens durante o teste de fluxo.
 */
class MockAIService extends AIService {
  constructor() {
    super(null as any, "mock-model");
  }

  async analyze(prompt: string): Promise<string> {
    console.log(`   [AI CALL] Prompt (resumo): ${prompt.substring(0, 80)}...`);
    
    // Simula uma resposta baseada no nome do agente no prompt
    if (prompt.includes("Security Officer")) {
      return JSON.stringify([{ line: 10, message: "Possível vazamento de chave detectado (MOCK)." }]);
    }
    return "OK";
  }

  cleanJson(text: string): string {
    return text;
  }
}

async function runFlowTest() {
  console.log("🚀 Iniciando Teste de Fluxo: AgentOrchestrator (Fase 1)\n");

  const mockAI = new MockAIService();
  const orchestrator = new AgentOrchestrator(mockAI);

  const file = "src/secret.py";
  const diff = `+ apiKey = "123456"
+ print("Hello World")`;
  const validLines = new Set([1, 2]);

  console.log(`📝 Simulando revisão do arquivo: ${file}`);
  console.log("--------------------------------------------------");

  const reviews = await orchestrator.reviewChunk(file, "secret.py", diff, validLines);

  console.log("\n📊 Resultado Final do Orquestrador:");
  if (reviews.length === 0) {
    console.log("   ✨ Nenhum problema encontrado (ou agentes retornaram OK).");
  } else {
    reviews.forEach(r => {
      console.log(`   📍 Linha ${r.line}: ${r.body}`);
    });
  }

  console.log("\n✅ Teste de fluxo finalizado.");
}

runFlowTest().catch(console.error);
