# 🤖 AI Code Reviewer: The Council of Agents

O **AI Code Reviewer** é uma GitHub Action de próxima geração que utiliza um sistema de agentes autônomos para realizar revisões de código inteligentes, modulares e escaláveis.

Ao contrário de abordagens monolíticas, aqui seu código é analisado por um "conselho de especialistas" orquestrado por IA.

## 🚀 Principais Características

- **Conselho de Agentes**: Especialistas em Segurança, Arquitetura e Clean Code agindo simultaneamente.
- **AI-Native Triage**: Um Agente Gestor (Manager) detecta automaticamente a linguagem e o framework do arquivo, decidindo quais especialistas devem atuar.
- **Powered by LangChain**: Arquitetura robusta para orquestração de prompts e suporte a múltiplos modelos (OpenAI, Gemini, etc).
- **Integração JIRA (Enterprise)**: Criação automática de tickets para falhas críticas (BLOCKING).
- **Regras Customizadas**: Injeção dinâmica de diretrizes específicas do seu projeto via YAML.
- **Deduplicação Inteligente**: Redução de ruído através da consolidação de achados concorrentes.

---

## 🏗️ Arquitetura e Conceito

O projeto foi desenhado como uma **Action Reutilizável**. Isso significa que ele vive em um repositório centralizado e é consumido por outros projetos da organização sem duplicação de código.

### O Fluxo:
1. **Developer** abre um PR no repositório do projeto.
2. **GitHub Action** dispara e "chama" o código deste repositório central.
3. **Council of Agents** analisa o diff e posta comentários diretamente no PR.

---

## ⚙️ Configuração
 
### Inputs Disponíveis
 
| Parâmetro | Descrição | Obrigatório |
| :--- | :--- | :--- |
| `github_token` | Token do GitHub (use `${{ secrets.GITHUB_TOKEN }}`) | Sim |
| `ai_api_key` | Chave de API da sua IA (OpenAI, Gemini, etc) | Sim |
| `ai_model` | Nome do modelo (ex: `gpt-4o`, `gemini-1.5-pro`) | Sim |
| `ai_base_url` | URL base da API (ex: para usar Gemini via OpenAI endpoint) | Não |
| `custom_rules` | Regras de negócio específicas do seu projeto (Texto/YAML) | Não |
| `enable_jira` | Ativa a integração com JIRA (`true` ou `false`) | Não |
| `jira_host` | Domínio do JIRA (ex: `empresa.atlassian.net`) | Não |
| `jira_email` | E-mail do usuário do JIRA para criação de tickets | Não |
| `jira_token` | API Token do JIRA | Não |
| `jira_project` | Chave do projeto no JIRA (ex: `PROJ`) | Não |
 
### Exemplo de Workflow YAML
 
Adicione este arquivo em `.github/workflows/ai-reviewer.yml` no seu projeto:

```yaml
name: "AI Code Review"
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: Digital-Analytics-Apps/ai-code-reviewer@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          ai_api_key: ${{ secrets.AI_API_KEY }}
          ai_model: "gpt-4o"
          # Opcional: Para usar Gemini (Google) via interface OpenAI
          ai_base_url: "https://generativelanguage.googleapis.com/v1beta/openai/"
          # Opcional: Integração JIRA
          enable_jira: "true"
          jira_host: "seu-dominio.atlassian.net"
          jira_token: ${{ secrets.JIRA_TOKEN }}
          jira_email: "seu-email@empresa.com"
          jira_project: "PROJ"
          # Opcional: Regras Customizadas
          custom_rules: |
            - Prefira Early Return em vez de IFs aninhados.
            - O uso de 'console.log' é proibido em produção.
```

---

## 🏢 Cenários de Uso e Compliance

### ☁️ GitHub Cloud
Funciona "out-of-the-box" usando runners `ubuntu-latest`. Os dados são processados por modelos como GPT-4 ou Claude via API.

### 🏢 On-Premises (GitHub Enterprise)
Para empresas com restrições de compliance, a Action suporta o uso de **IAs Locais** (Ollama, vLLM):
- Use um `runs-on: self-hosted`.
- Aponte o `ai_base_url` para o IP interno do seu servidor de IA.
- **Zero dados saem da rede da empresa.** 🔒

```yaml
with:
  ai_base_url: "http://seu-ai-server-interno:11434/v1"
  ai_model: "llama3:70b"
```

---

## 🧪 Desenvolvimento e Testes

```bash
# Teste de Fluxo Completo (Simulado)
npx tsx tests/test-flow.ts

# Teste de Integração JIRA (Mock)
npx tsx tests/test-jira.ts
```

---
Desenvolvido com ❤️ por Antigravity (Digital-Analytics-Apps).
