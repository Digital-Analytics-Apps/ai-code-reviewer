import { AgentOrchestrator } from "../src/services/agent.orchestrator";
import { AIService } from "../src/services/ai.service";
import { GithubService } from "../src/services/github.service";

// 1. Mock do GithubService
class MockGithub extends (GithubService as any) {
  constructor() {
    super({}, "owner", "repo", 1);
  }
  async searchCode(q: string) {
    console.log(`   [MOCK SEARCH] Buscando por usos de: ${q}`);
    return [{ path: "src/legacy-payment.ts", line: 1 }];
  }
  async getFileContent(p: string) {
    return "function checkout() { processPayment('123'); } // Chama a função que mudou de assinatura";
  }
}

// 2. Mock da IA
class MockAI extends AIService {
  constructor() { super("k", "u", "m"); }
  async analyze(sys: string, user: string) {
    if (sys.includes("GLOBAL IMPACT CONTEXT")) {
      console.log("   [SUCCESS] Contexto Global injetado no Prompt do Agente!");
      if (sys.includes("legacy-payment.ts")) {
        return JSON.stringify([{ line: 1, message: "⚠️ IMPACTO DETECTADO: Esta mudança quebra o contrato esperado no arquivo legacy-payment.ts (MOCK)" }]);
      }
    }
    if (sys.includes("Dispatcher")) {
        return JSON.stringify({ 
          language: "ts", 
          agents: ["general"], 
          impactfulSymbols: ["processPayment"],
          reasoning: "Mudança em função pública detectada."
        });
    }
    return "[]";
  }
  cleanJson(t: string) { return t.trim(); }
}

async function runImpactTest() {
  console.log("🚀 Testando Fase 4: Global Impact Discovery\n");

  const mockAI = new MockAI();
  const mockGh = new MockGithub();
  const orchestrator = new AgentOrchestrator(mockAI, mockGh as any);

  const file = "src/payment.ts";
  const diff = "+ export function processPayment(id: string, amount: number) {}"; 
  const validLines = new Set([1]);

  console.log(`📝 Simulando revisão de: ${file}`);
  console.log("--------------------------------------------------");

  const reviews = await orchestrator.reviewChunk(file, "payment.ts", diff, validLines);

  console.log("\n📊 Resultado Final:");
  reviews.forEach(r => {
    console.log(`   📍 ${r.body}`);
  });

  console.log("\n✅ Teste de impacto finalizado.");
}

runImpactTest().catch(console.error);
