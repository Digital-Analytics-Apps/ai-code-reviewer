# Detalhamento Técnico e Arquitetura: AI Code Reviewer

Este documento fornece uma análise profunda das escolhas técnicas, fluxos de funções e decisões de design tomadas no desenvolvimento do bot revisor.

---

## 🚀 1. Fluxo de Execução "E2E" (End-to-End)

### Fase A: Inicialização e Bootstrap (`src/index.ts`)
1.  **`run()`**: Ponto de entrada principal.
2.  **`getConfig()` & `getVar()`**: 
    *   **Escolha:** Suporta tanto variáveis de ambiente (`PROCESS.ENV.VAR`) quanto inputs nativos do GitHub Actions (`INPUT_VAR`). Isso torna a ferramenta versátil para rodar localmente ou no CI.
3.  **`validateRequiredInputs()`**: Garante que o `GITHUB_TOKEN` e `AI_API_KEY` existam antes de gastar qualquer recurso.

### Fase B: Contextualização (`src/services/github.service.ts`)
1.  **`fetchDiff()`**: Recupera o diff bruto do PR.
2.  **`parseDiff()`**: Converte o diff de texto para uma árvore de objetos (`File` -> `Chunk` -> `Change`).
    *   **Por que separar?** Precisamos saber quais linhas foram *adicionadas* para garantir que o bot só comente em código novo, evitando críticas a códigos legados não alterados.
3.  **`cleanPreviousReviews()`**: O bot busca e deleta seus próprios comentários de revisões anteriores.
    *   **Escolha de Design:** Mantém o PR limpo e evita que o desenvolvedor receba notificações repetidas de problemas já corrigidos.

### Fase C: O Motor de Análise (`src/index.ts` -> `processFiles`)
1.  **Batching (`BATCH_SIZE = 2`)**: 
    *   **Por que?** Evitar o erro **429 (Too Many Requests)** de provedores de IA. Rodar arquivos em paralelo acelera o processo, mas o limite de 2 garante estabilidade em PRs grandes.
2.  **`isIgnoredFile()`**: Filtra arquivos como `package-lock.json`, migrations de banco ou arquivos binários.

### Fase D: Orquestração e Contexto Global (`src/services/agent.orchestrator.ts`)
Esta é a fase mais complexa:
1.  **`triageFile()`**: Um agente "Manager" rápido lê o diff e decide quais especialistas acionar (`security`, `general`).
    *   **Escolha:** Economiza tokens ao não rodar o agente de segurança em um arquivo CSS, por exemplo.
2.  **`discoverGlobalContext()`**:
    *   Se o Triage identificar um "Símbolo de Impacto" (ex: mudou a assinatura de um método público), o bot executa um **Grep Local** no runner.
    *   **Por que Grep Local e não API Search?** A API de busca do GitHub é limitada (30 req/min) e lenta. O Grep no código clonado é instantâneo e ilimitado.
3.  **`Agent.analyze()`**: Os especialistas recebem o diff + as regras customizadas + o contexto global encontrado.

### Fase E: Consolidação e Postagem
1.  **`consolidateFindings()`**: 
    *   Se o Agente de Segurança e o de Arquitetura apontarem um erro na mesma linha, esta função agrupa as mensagens em um único comentário.
2.  **`submitReview()`**: Envia os comentários inline em blocos de 30 (limite do GitHub).
3.  **`upsertSummaryComment()`**: Cria ou atualiza um comentário de resumo no topo do PR.
    *   **Fingerprinting:** Usa um comentário HTML oculto (`<!-- AI_CODE_REVIEW_SUMMARY -->`) para localizar seu próprio comentário sem precisar de IDs externos.

---

## 🛠️ 2. Escolhas Técnicas e "Porquês"

### 1. Council of Agents (Multi-Agentes)
*   **Decisão:** Em vez de um prompt gigante "faça tudo", usamos agentes especializados.
*   **Benefício:** Prompts menores e específicos são mais precisos e sofrem menos de "alucinação".
*   **Política "Silence is Gold":** Reforçamos nos prompts que o bot **nunca** deve comentar para elogiar ou dizer que o código está correto. Se não houver problemas, o output deve ser um array vazio. Isso evita ruído e foca apenas no que precisa ser corrigido.

### 2. Validação via Zod (`src/schemas/review.schema.ts`)
*   **Decisão:** Forçar o modelo de IA a responder em JSON e validar com Zod.
*   **Benefício:** Se o modelo de IA "tagarelar" fora do JSON, o sistema falha graciosamente ou limpa a string antes de tentar processar, garantindo que o bot nunca quebre o workflow do GitHub.

### 3. Integração com Jira
*   **Decisão:** Filtro por palavra-chave `BLOCKING`.
*   **Benefício:** Nem todo comentário de IA precisa virar um ticket. Ao filtrar por severidade, garantimos que apenas dívidas técnicas reais ou falhas de segurança entrem no backlog do time.

### 4. Uso do Esbuild para Bundling
*   **Decisão:** Compilar todo o projeto TypeScript em um único arquivo `dist/index.js`.
*   **Benefício:** Performance extrema no GitHub Action. O runner não precisa baixar `node_modules` ou compilar TS em tempo de execução; ele apenas executa o binário JS.

---

## 📈 3. Resumo da Árvore de Decisão do Bot

```text
PR Aberto
   |
   V
Validar Configuração (Tokens/Permissões)
   |
   V
Limpar rastros de revisões passadas (Anti-Spam)
   |
   V
Analisar Diff por Arquivo
   |-- É ignorado? -> Pular
   |-- AI Triage: Quais especialistas? Tem impacto externo?
   |-- Se impacto externo -> Local Grep para contexto
   V
Conselho de Agentes: Análise Técnica
   |
   V
Consolidação (Remover duplicatas de linha)
   |
   V
Postar Comentários Inline
   |
   V
Gerar Resumo Executivo + Veredito (Aprovar/Pedir Mudança)
   |
   V
Criar Tickets Jira (Apenas para Blockers)
```

---
*Documentação Técnica - Versão 1.0*
