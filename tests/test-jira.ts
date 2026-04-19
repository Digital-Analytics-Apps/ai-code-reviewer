import { JiraService } from "../src/services/jira.service";

// Mock do Fetch Global para simular a API do JIRA
global.fetch = (async () => ({
  ok: true,
  json: async () => ({ key: "PROJ-123" }),
})) as any;

async function testJira() {
  console.log("🚀 Testando Integração JIRA (Mock)...\n");

  const jira = new JiraService({
    host: "test.atlassian.net",
    email: "test@test.com",
    token: "mock-token",
    projectKey: "PROJ"
  });

  try {
    const key = await jira.createIssue(
      "[SECURITY] Vulnerabilidade Crítica",
      "O arquivo auth.ts contém uma chave exposta."
    );
    console.log(`✅ Sucesso! Ticket criado: ${key}`);
  } catch (e) {
    console.error("❌ Falha no teste:", e);
  }
}

testJira();
