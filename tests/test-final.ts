import { SummaryAgent } from "../src/agents/summary.agent";
import { AIService } from "../src/services/ai.service";

async function testFinalSummary() {
  console.log("🚀 Testando Fase 5: Executive Summary & Verdict\n");

  const aiService = new AIService("k", "u", "m");
  const summaryAgent = new SummaryAgent(aiService);

  // Simulando achados que o bot encontrou
  const findings = [
    { path: "src/auth.ts", line: 10, body: "⚠️ Sugestão: Use constantes para mensagens de erro.", side: "RIGHT" as const },
    { path: "src/db.ts", line: 45, body: "🔴 BLOCKING: SQL Injection detectado no parâmetro query.", side: "RIGHT" as const }
  ];

  console.log("📝 Gerando resumo para 2 achados (incluindo um BLOCKING)...\n");
  
  // Mock da resposta da IA para o teste
  (aiService as any).analyze = async () => {
      return `
## 📝 Resumo Executivo
O código apresenta melhorias na estrutura de autenticação, mas introduz um risco crítico de segurança na camada de banco de dados.

### 📊 Análise de Risco
**Score:** 9/10
**Veredito:** 🔴 BLOQUEADO

### 🔍 Principais Achados
- SQL Injection detectado em src/db.ts.
- Problemas de consistência de strings em src/auth.ts.
      `.trim();
  };

  const summary = await summaryAgent.summarize(findings);
  
  console.log("--- RESULTADO DO VEREDITO ---");
  console.log(summary);
  console.log("------------------------------");
  console.log("\n✅ Teste de veredito finalizado.");
}

testFinalSummary().catch(console.error);
