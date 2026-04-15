# 🤖 AI Code Reviewer — GitHub Action

> Revisão de código inteligente, automatizada e 100% configurável. Coloque uma IA para fiscalizar todos os Pull Requests da sua organização — com regras suas, no provedor de IA que você escolher.

---

## ✨ O que é isso?

O **AI Code Reviewer** é uma **GitHub Action reutilizável** que analisa automaticamente os diffs dos seus Pull Requests usando Inteligência Artificial. Em vez de gastar dezenas de minutos revisando vulnerabilidades de sintaxe ou _magic strings_, a IA faz essa primeira passagem como um pente-fino, colocando anotações diretas nas linhas alteradas do GitHub.

**Funciona com qualquer provedor OpenAI-Compatible:** OpenAI, Anthropic, Google Gemini, Ollama (local), vLLM e qualquer outro que implemente o protocolo OpenAI.

---

## 📋 Índice

- [Como Funciona](#como-funciona)
- [Passo a Passo da Configuração](#passo-a-passo-da-configuração)
- [Provedores Intranet e Ollama](#-provedores-intranet-e-segurança-avançada-ollama)
- [Ensinando a IA com Suas Próprias Regras](#-ensinando-a-ia-com-suas-próprias-regras-custom-rules)
- [Como a IA Vai Trabalhar](#como-a-ia-vai-trabalhar-gabarito-de-mensagens)
- [Sobre os Tokens](#-sobre-os-tokens-não-se-confunda)
- [Permissões](#-permissões-você-precisa-configurar-algo)
- [GitHub Free vs. On-Premises](#-cenários-de-uso-github-free-vs-on-premises)
- [Arquitetura e Código-Fonte](#️-arquitetura-e-código-fonte)
- [Como dar Manutenção](#️-como-dar-manutenção-ou-criar-novas-regras)

---

## Como Funciona

O AI Code Reviewer opera com **2 repositórios com papéis diferentes**:

> 🔧 **`ai-code-reviewer`** = a **ferramenta** (este repositório — o robô que faz a revisão)
>
> 🏗️ **`seu-projeto`** = o **projeto que usa a ferramenta** (onde o time trabalha)

```
┌─────────────────────────────────────────┐     ┌──────────────────────────────────────────┐
│   Repo: ai-code-reviewer                │     │   Repo: meu-projeto-backend              │
│   (Digital-Analytics-Apps)              │     │   (onde o time trabalha)                 │
│                                         │     │                                          │
│  📦 É a "FERRAMENTA"                    │     │  🏗️ É o "PROJETO REAL"                   │
│                                         │     │                                          │
│  ├── src/index.ts   (código do robô)    │     │  ├── src/                                │
│  ├── dist/index.js  (compilado/pronto)  │     │  ├── .github/                            │
│  └── action.yml     (contrato público)  │     │  │   └── workflows/                      │
│                                         │     │  │       └── ai-reviewer.yml ← você cria │
│                                         │     │  └── ...                                 │
└─────────────────────────────────────────┘     └──────────────────────────────────────────┘
          ▲                                                         │
          │                                                         │
          └──────────── uses: Digital-Analytics-Apps/ ──────────────┘
                             ai-code-reviewer@main
```

### O Fluxo de Revisão

```
1. Desenvolvedor abre um Pull Request em "meu-projeto-backend"
        │
        ▼
2. GitHub detecta o arquivo .github/workflows/ai-reviewer.yml no projeto
        │
        ▼
3. O workflow declara:
   uses: Digital-Analytics-Apps/ai-code-reviewer@main
        │
        ▼
4. GitHub baixa automaticamente o código do repositório "ai-code-reviewer"
   e executa o dist/index.js dentro do CONTEXTO do "meu-projeto-backend"
        │
        ▼
5. O robô lê o diff do PR → envia para a IA → posta comentários inline no PR
        │
        ▼
6. ✅ Revisão concluída! Os comentários aparecem dentro do PR do projeto
```

> 💡 Pensa no `ai-code-reviewer` como um **pacote npm publicado**. O `meu-projeto-backend` simplesmente o **instala e usa** — sem precisar copiar ou entender o código interno. A diferença é que em vez de `npm install`, você usa `uses:` no YAML do GitHub Actions.

---

## Passo a Passo da Configuração

### 1. Preparando o Terreno (Secrets)

No repositório **do seu projeto** (não deste repo), defina a chave de acesso do provedor de IA escolhido:

1. Vá até `Settings > Secrets and variables > Actions`
2. Clique em **New repository secret**
3. **Nome:** `AI_API_KEY`
4. **Valor:** `<cole sua chave da OpenAI, Anthropic, Gemini, etc, aqui!>`

### 2. Adicionando o Workflow

No mesmo repositório, crie o arquivo `.github/workflows/ai-reviewer.yml`:

```yaml
name: "AI Code Review"

on:
  pull_request:
    types: [opened, synchronize] # Executa quando alguém abre ou atualiza um PR
  issue_comment:
    types: [created] # Executa novamente se você comentar "/ai-review" no PR!

permissions:
  contents: read
  pull-requests: write # Permissão NECESSÁRIA pro bot disparar anotações no código

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Iniciar Fiscalização por Inteligência Artificial
        uses: Digital-Analytics-Apps/ai-code-reviewer@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }} # Gerado automaticamente pelo GitHub
          ai_api_key: ${{ secrets.AI_API_KEY }}      # Criado por você nos Secrets do projeto
          ai_model: "gpt-4o" # Mude para 'gemini-1.5-pro' ou afins livremente
```

---

## 🔒 Provedores Intranet e Segurança Avançada (Ollama)

Se o compliance de segurança da sua empresa não permitir que o código vá para Nuvem ou terceiros (como OpenAI API), não tem problema! Como nossa Action foi arquitetada para ser 100% **OpenAI-Compatible**, você pode interligar o sistema direto a um servidor de IA hospedado localmente (Ex: Ollama ou vLLM).

Use o campo opcional `ai_base_url`:

```yaml
with:
  github_token: ${{ secrets.GITHUB_TOKEN }}
  ai_api_key: "QUALQUER_CHAVE_FALSA_APENAS_PARA_PASSAR"
  ai_model: "llama3:70b"
  ai_base_url: "http://ip.do.seu.servidor.bancario:11434/v1"
```

---

## 🧠 Ensinando a IA com Suas Próprias Regras (Custom Rules)

Por padrão, a ferramenta aplica **Rigor Absoluto e Práticas OWASP (Segurança)**. No entanto, o seu time pode ter padrões próprios!

### Método A: Arquivo Global (Fácil — Recomendado)

A Action buscará automaticamente esse arquivo. Crie na raiz do projeto: `.github/ai-reviewer-rules.md`.

Exemplo de conteúdo usando a melhor prática de _Prompt Engineering_:

```markdown
<identity>
Você é um Engenheiro de Software Sênior especialista na arquitetura da ACME Inc. Seu objetivo é fiscalizar minuciosamente os Pull Requests do nosso time.
</identity>

<tech_stack>
- Backend: Node.js com NestJS e TypeScript estrito.
- Banco de Dados: PostgreSQL utilizando Prisma ORM.
- Frontend: React (Next.js App Router) e TailwindCSS.
</tech_stack>

<rules>
- É ESTRITAMENTE PROIBIDO o uso de tipagens `any` ou `@ts-ignore`. Se houver no diff, dê FAIL imediato (BLOCKING).
- Não autorize chaves de API cruas (hardcoded) nos arquivos; exija variáveis de ambiente.
</rules>

<communication_style>
Seja direto e muito educado. Se apontar um erro, mostre um "Exemplo de como deveria ser" em markdown.
</communication_style>
```

> 💡 **Dica Pro: Knowledge Injection**
> Os Modelos de IA modernos suportam "Context Windows" muito grandes. Se o seu projeto usa Angular, Vue ou um Framework próprio, **copie e cole integramente** a documentação oficial (Ex: [Angular Style Guide](https://angular.dev/style-guide)) dentro da tag `<best_practices>`. O robô processará como se tivesse lido aquele manual antes de revisar cada linha!

### Método B: Diretamente Via YAML (Hardcoded)

```yaml
with:
  # ... restante do script ...

  # Regras Rápidas:
  custom_rules: "Somente revise arquivos backend. Recuse nomes de funções em português."

  # Ou um arquivo isolado em outra pasta:
  rules_path: ".arquitetura/guidelines_senior_team.md"
```

---

## Como a IA Vai Trabalhar? (Gabarito de Mensagens)

A IA fará leituras inline com **EMOJIs de Severidade**:

- 🔴 **BLOCKING:** Problemas críticos de segurança (senhas nos logs, injeções de SQL).
- 🟡 **SUGGESTION:** Má gestão da sintaxe e refatorações de Clean Code.
- 🟢 **NIT:** Padrões bobos, nomes esquisitos ou desalinhamentos leves.
- ❓ **QUESTION:** Abordagens de extrema complexidade que exijam explicação (Ex: Algoritmos lentos O(N²)).

### 🔄 Quero que a IA revise tudo de novo!

Fez commits de refatoração, a action falhou por indisponibilidade ou quer uma segunda opinião? Comente no Pull Request:

**`/ai-review`**

O robô interceptará a mensagem e iniciará uma re-leitura silenciosa imediatamente.

---

## 🔑 Sobre os Tokens: Não se Confunda

| Token          | Quem gera                          | Onde fica                        | Para que serve                         |
| -------------- | ---------------------------------- | -------------------------------- | -------------------------------------- |
| `GITHUB_TOKEN` | **GitHub automaticamente**         | Em todo repo, sempre disponível  | Postar comentários no PR, ler o código |
| `AI_API_KEY`   | **Você** (OpenAI, Anthropic, etc.) | Secrets do `meu-projeto-backend` | Chamar a IA para fazer a análise       |

> ⚠️ **Importante:** O `AI_API_KEY` deve ser criado nos Secrets do **projeto que será revisado**, não neste repositório (`ai-code-reviewer`).

---

## 🔐 Permissões: Você Precisa Configurar Algo?

**Não.** Nenhuma configuração de permissão é necessária além do bloco já incluído no workflow.

```yaml
permissions:
  contents: read         # Lê o código do repositório para buscar o diff
  pull-requests: write   # Posta os comentários de revisão inline no PR
```

> ⚠️ **Atenção:** Se o bloco `permissions:` for omitido, o GitHub aplica permissões padrão mais restritivas que podem impedir o bot de comentar no PR.

### Isolamento por Repositório

O `GITHUB_TOKEN` é gerado com **escopo restrito ao repositório onde o workflow está rodando**. Por design do GitHub Actions, o token gerado para o `meu-projeto-backend` só tem acesso ao `meu-projeto-backend`. Cada execução recebe seu próprio token isolado, descartado ao final do job.

| Pergunta | Resposta |
| -------- | -------- |
| Preciso configurar permissão no `ai-code-reviewer`? | ❌ Não |
| Preciso configurar permissão no GitHub da organização? | ❌ Não |
| As permissões valem para outros repositórios? | ❌ Não — isoladas por execução |
| Onde declaro as permissões? | ✅ No bloco `permissions:` do workflow do próprio projeto |

---

## 🏢 Cenários de Uso: GitHub Free vs. On-Premises

### Cenário 1 — GitHub Free (Cloud) ☁️

> Todos os repositórios estão no **GitHub.com**: `ai-code-reviewer` + projetos do time.

Tudo funciona sem nenhuma mudança. O workflow padrão já está configurado corretamente com `runs-on: ubuntu-latest`.

### Cenário 2 — GitHub Enterprise Server (On-Premises) 🏢

> Todos os repositórios estão na **mesma instância GHES**: `ai-code-reviewer` + projetos do time.

Como **ambos os repos vivem na mesma instância**, a referência `uses:` funciona normalmente — sem GitHub Connect ou espelhamento externo. A única mudança necessária no workflow é:

```yaml
# ❌ GitHub.com
runs-on: ubuntu-latest

# ✅ GHES (On-Premises)
runs-on: self-hosted   # Runner configurado internamente pela empresa
```

O `uses:` permanece com a mesma sintaxe — o GHES resolve internamente.

#### Comparativo

| Item                          | GitHub Free (Cloud)           | GHES (On-Premises)                       |
| ----------------------------- | ----------------------------- | ---------------------------------------- |
| `uses:` do `ai-code-reviewer` | ✅ Resolvido pelo github.com  | ✅ Resolvido internamente no GHES        |
| Runners                       | `ubuntu-latest` (gratuito)    | `self-hosted` (configurado pela empresa) |
| `GITHUB_TOKEN`                | ✅ Automático                 | ✅ Automático (idêntico)                 |
| IA na nuvem (OpenAI, etc.)    | ✅ Funciona                   | ⚠️ Depende do compliance da empresa      |
| IA local (Ollama/vLLM)        | ✅ Funciona via `ai_base_url` | ✅ Ideal — runner acessa a rede interna  |

#### Usando IA local no On-Premises (compliance total):

```yaml
- name: Revisar com IA
  uses: Digital-Analytics-Apps/ai-code-reviewer@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    ai_api_key: "qualquer-valor"  # Ollama não exige chave real
    ai_model: "llama3:70b"
    ai_base_url: "http://servidor-ia-interno.empresa.com:11434/v1"
```

O runner self-hosted acessa o Ollama/vLLM via rede interna → **zero dados saem da empresa**. 🔒

> 💡 Esta é a grande vantagem da nossa arquitetura OpenAI-Compatible: o **código da Action não muda em nenhum dos dois cenários**. O que muda é apenas a infraestrutura configurada no workflow do projeto.

---

## 🏛️ Arquitetura e Código-Fonte

### Filosofia do Projeto: Leveza, Segurança e Desacoplamento

- **Padrão Agnóstico (OpenAI-Compatible):** Utilizamos o SDK nativo `openai-node` em vez de SDKs engessados focados em um único provedor. Isso permite que a Action converse com **qualquer** IA — desde modelos fechados (GPT-4, Claude) até modelos rodando 100% isolados na intranet usando `Ollama` ou `vLLM`.
- **Zero Telemetria:** Evitamos intencionalmente frameworks como LangChain. Usar requisições REST cruas garante vazamento zero de pacotes e tempos de build de ~80ms.

### Estrutura Modular do Código-Fonte (`src/`)

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

| Módulo | Responsabilidade |
|--------|-----------------|
| `schemas/review.schema.ts` | Valida com Zod o JSON retornado pela IA. Evita HTTP `422` no GitHub |
| `services/ai.service.ts` | Chama a IA com retry e Backoff Exponencial (2s, 4s, 8s...) |
| `services/github.service.ts` | Posta comentários em lotes paginados de 50 para não levar timeout |
| `guidelines/guidelines.ts` | Carrega regras na ordem: inline > arquivo customizado > fallback OWASP |
| `utils/diff.utils.ts` | `isIgnoredFile`, `getValidLines`, `buildDiffContent`, `buildReviewPrompt` |
| `index.ts` | Orquestra todo o fluxo: contexto → diff → IA → comentários |

### Elevator Pitch para a sua Reunião

> _"Nosso AI Code Reviewer não é apenas um bot chamando uma IA; é uma esteira de segurança. Ele usa arquitetura REST limpa e garante blindagem de dados, podendo rodar integrado com IAs Open Source rodando nos cofres das empresas. Por baixo dos panos, ele usa Zod para evitar bugs de alucinação e Backoff Exponencial para lidar com estresse de rede, entregando o Code Review mais estável do mercado sem engessar a arquitetura com Frameworks pesados."_

---

## 🛠️ Como dar Manutenção ou Criar Novas Regras

### Onde mexer para cada tipo de mudança

| O que você quer alterar | Arquivo |
|------------------------|---------|
| Regras padrão de revisão (OWASP, Clean Code) | `src/guidelines/guidelines.ts` |
| Lógica de chamada à IA ou retry | `src/services/ai.service.ts` |
| Comunicação com a API do GitHub | `src/services/github.service.ts` |
| Formato do JSON retornado pela IA | `src/schemas/review.schema.ts` |
| Arquivos ignorados na revisão | `src/utils/diff.utils.ts` |
| Fluxo principal: contexto, diff, paralelismo | `src/index.ts` |

### Como Compilar e Publicar

Para o GitHub Actions funcionar com TypeScript, precisamos empacotar tudo em um único `dist/index.js`. Se você mexeu em **qualquer arquivo** dentro de `src/`, rode obrigatoriamente antes do push:

```bash
# 1. Instale as dependências
npm install

# 2. Formate o código
npm run format

# 3. Verifique erros de lint
npm run lint

# 4. Compile o bundle de produção
npm run build

# 5. Commite tudo (incluindo o /dist) e publique
git add .
git commit -m "feat: nova regra ou melhoria"
git push origin main
```

Assim que o `.js` compilado subir, **todos** os repositórios que usam `uses: Digital-Analytics-Apps/ai-code-reviewer@main` herdarão a nova inteligência na próxima execução de CI. ⚡

---

> Desenvolvido com 🥷 por Gilson Russo.
