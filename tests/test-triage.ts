import { TriageService, AgentCategory } from "../src/services/triage.service";

const triage = new TriageService();

const testFiles = [
  "src/index.ts",
  "src/services/ai.service.ts",
  "api/v1/users.sql",
  "README.md",
  "docs/architecture.md",
  "package.json",
  "frontend/components/Button.tsx",
  ".github/workflows/main.yml"
];

console.log("🚀 Iniciando Teste de Triage Heurística (Fase 1)\n");
console.log("--------------------------------------------------");

testFiles.forEach(file => {
  const result = triage.triageFile(file);
  console.log(`📄 Arquivo: ${file.padEnd(30)}`);
  console.log(`   Linguagem: ${result.language}`);
  console.log(`   Agentes:   [${result.suggestedAgents.join(", ")}]`);
  
  // Validações simples
  if (file.endsWith(".sql") && !result.suggestedAgents.includes(AgentCategory.SECURITY)) {
    console.log("   ❌ ERRO: SQL deveria ter o Agente de Segurança.");
  }
  if (file.endsWith(".md") && result.suggestedAgents.includes(AgentCategory.SECURITY)) {
    console.log("   ❌ ERRO: Markdown não deveria ter Agente de Segurança (Economia de tokens).");
  }
  
  console.log("--------------------------------------------------");
});

console.log("\n✅ Teste de Triage finalizado. Verifique se os agentes selecionados fazem sentido para cada tipo de arquivo.");
