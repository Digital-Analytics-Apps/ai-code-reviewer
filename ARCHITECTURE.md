# 🏛️ Arquitetura e Decisões de Engenharia (AI Code Reviewer)

Este documento destina-se aos **Engenheiros e Mantenedores** deste repositório. O objetivo é fornecer uma visão clara de como o AI Code Reviewer funciona por baixo dos panos, por que certas tecnologias foram escolhidas e como explicar o valor desta solução para outros desenvolvedores.

---

## 1. Filosofia do Projeto: Leveza, Segurança e Desacoplamento

Ao construir esta Action, nossa maior preocupação foi garantir que o código analisado de nossos clientes/organização estivesse estritamente seguro e que o robô não impusesse regras genéricas restritivas. 

**Decisões Arquiteturais Chave:**
- **Padrão Agnóstico (OpenAI-Compatible):** Utilizamos o SDK nativo `openai-node` em vez de SDKs engessados focados em apenas um provedor (como o antigo `@google/generative-ai`). Isso permite que a Action converse com **qualquer** IA — desde modelos fechados (GPT-4, Claude) configurados via API enterprise (sem treinamento de pesos), até modelos rodando 100% isolados na intranet de uma empresa usando `Ollama` ou `vLLM` (passando o IP na variável `base_url`).
- **Zero Telemetria:** Evitamos intencionalmente frameworks como LangChain. Eles trazem dependências pesadas e riscos de telemetria escondida. Usar requisições REST cruas garante vazamento zero de pacotes e tempos de build de ~80 milisegundos.

---

## 2. Estrutura Modular do Código-Fonte (`src/`)

A partir da versão atual, o código foi refatorado em módulos com responsabilidades isoladas. A estrutura usa padrões *Wrapper* e paralelismo controlado para suportar cenários de alto estresse na rede.

```
src/
├── index.ts                  ← Entrypoint + Orquestrador principal (função run())
├── schemas/
│   └── review.schema.ts      ← Schemas Zod + interface GithubReviewComment
├── services/
│   ├── github.service.ts     ← GithubService: toda comunicação com a API do GitHub
│   └── ai.service.ts         ← AIService: chamadas à IA + retry + limpeza de JSON
├── guidelines/
│   └── guidelines.ts         ← MASTER_GUIDELINES + função getGuidelines()
└── utils/
    └── diff.utils.ts         ← Utilitários: filtragem de arquivos, parsing do diff, builder do prompt
```

### A) Validação Estrita Mão-de-Ferro (Zod) — `src/schemas/review.schema.ts`
As APIs Baseadas em LLM adoram alucinar formatações em Markdown (````json ... ````). 
Se mandarmos um JSON quebrado para a API de "Comments" do GitHub, a Action quebra com erro HTTP `422 Unprocessable Entity`.
Por isso, nosso fluxo força um Parser regex (função `cleanJson`) seguido por uma checagem Zod (`ReviewArraySchema`). Se a IA responder lixo, nós falhamos graciosamente ignorando a resposta ao invés de derrubar o pipeline de CI inteiro.

### B) Paralelismo e Proteção de Rate Limits — `src/index.ts`
O robô pega o Git Diff (todas as pastas modificadas do PR) usando a estrutura do pacote auxiliar `parse-diff`. E aqui entra a sacada mestra de performance:
1. Separamos as tarefas de IA "arquivo por arquivo".
2. **Concorrência Controlada:** Não disparamos o prompt para os 50 arquivos ao mesmo tempo. Limitamos a esteira da promise para rodar de `5 em 5` blocos (`CONCURRENCY_LIMIT = 5`). Isso evita banimento por IP / Rate Limit estourado nos servidores da API de IA.

### C) `AIService` (Resiliência) — `src/services/ai.service.ts`
Se uma API de inteligência artificial sobrecarregar, retornar Erro 503 (Serviço Indisponível) ou 429 (Too Many Requests), a Action não falha instantaneamente. A função interna `withRetry` implementa um algoritmo de **Backoff Exponencial**. A action respira por 2 segundos, tenta, respira 4 segundos, tenta de novo, protegendo a estabilidade das esteiras DevOps da organização em horários de pico.

### D) `GithubService` (Paginação de Comentários e Contexto) — `src/services/github.service.ts`
O Github permite postar notas "inline" diretamente nas linhas (Right Side/Lado direito do Diff). Nós separamos a API Octokit dentro dessa classe. Se a Action tiver que fazer 150 anotações de código, ela injetará em forma de lotes paginados (`CHUNK_SIZE = 50`) respeitando o limite do GitHub para não levar timeout.

### E) Injeção de Regras (Brain Core) — `src/guidelines/guidelines.ts`
Acabamos com lógicas codadas e complexas do tipo "Se é pasta 'frontend', leia regra A". Agora a injeção é totalmente determinística:
1. O Robô lê a **Master Guideline** (Regras irrevogáveis de OWASP / Segurança).
2. O Robô verifica se o usuário informou um `rules_path` (ex: `.github/regras.md`) e carrega.
3. Essas regras dinâmicas são transformadas no bloco central de sistema (*System Prompt*), enviadas para o Modelo e fundidas. O desenvolvedor no "outro lado" ganha total maestria sobre a interpretação do código.

### F) Utilitários de Diff — `src/utils/diff.utils.ts`
Funções puras auxiliares isoladas do orquestrador principal:
- `isIgnoredFile()` — filtra lock files, dist, .env e outros padrões automatizados.
- `getValidLines()` — retorna só as linhas adicionadas onde o GitHub permite comentar.
- `buildDiffContent()` — formata o chunk em string legível de diff (+/-/ ).
- `buildReviewPrompt()` — monta o prompt completo enviado à IA.

---

## Como Explicar Esse Bot Numa Reunião ("Elevator Pitch")
_"Nosso AI Code Reviewer não é apenas um bot chamando uma IA; é uma esteira de segurança. Ele usa arquitetura REST limpa e garante blindagem de dados, podendo rodar integrado com IAs Open Source rodando nos cofres das empresas. Por baixo dos panos, ele usa Zod para evitar bugs de alucinação e Backoff Exponencial para lidar com estresse de rede, entregando o Code Review mais estável do mercado sem engessar a arquitetura com Frameworks pesados."_

---

## 🛠️ Como dar manutenção ou criar novas Regras Nativas na Action

### 👉 Onde mexer para cada tipo de mudança

| O que você quer alterar | Arquivo |
|------------------------|---------|
| Regras padrão de revisão (OWASP, Clean Code) | `src/guidelines/guidelines.ts` |
| Lógica de chamada à IA ou retry | `src/services/ai.service.ts` |
| Comunicação com a API do GitHub | `src/services/github.service.ts` |
| Formato do JSON retornado pela IA | `src/schemas/review.schema.ts` |
| Arquivos ignorados na revisão | `src/utils/diff.utils.ts` |
| Fluxo principal: contexto, diff, paralelismo | `src/index.ts` |

### ⚙️ Como Compilar e Publicar ("Como Miletar o Bicho")

Para o ecossistema do GitHub Actions funcionar com _TypeScript_, nós não podemos simplesmente enviar o `src/` puro. Precisamos "empacotar" (buildar) todas as lógicas e as pastas do "node_modules" em um único arquivo de distribuição.

Se você mexeu em qualquer arquivo dentro de `src/`, **OBRIGATORIAMENTE** rode esse script antes de dar push:

1. Tenha o Node.js 20+ instalado.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Rode o script de Build (que utiliza o esbuild magicamente configurado):
   ```bash
   npm run build
   ```
4. Você verá que a pasta `/dist/index.js` foi alterada! Isso é o coração do build.
5. Agora basta commitar tudo (incluindo a `/dist`) e mandar pro Github:
   ```bash
   git add .
   git commit -m "feat: ensinamos nova regra para IA"
   git push origin main
   ```

Tudo pronto! Assim que você subir o `.js` compilado, **TODOS** os repositórios da sua empresa que utilizam a action `uses: Digital-Analytics-Apps/ai-code-reviewer@main` imediatamente herdarão essa nova inteligência na próxima esteira CI.
