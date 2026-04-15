# 🧭 Como Funciona a Arquitetura do AI Code Reviewer

## O Conceito: 2 Repositórios com Papéis Diferentes

O **AI Code Reviewer** foi projetado como uma **GitHub Action reutilizável**. Isso significa que ele vive em um repositório separado e pode ser "chamado" por qualquer outro repositório da organização — sem duplicar nenhum código.

Pense da seguinte forma:

> 🔧 **`ai-code-reviewer`** = a **ferramenta** (o robô que faz a revisão)
>
> 🏗️ **`seu-projeto`** = o **projeto que usa a ferramenta**

---

## Diagrama da Arquitetura

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

---

## O Fluxo Passo a Passo

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

---

## O que Vai em Cada Repositório

### ✅ `ai-code-reviewer` — Já está pronto. Não mexa.

Este é o repositório que você (mantenedor) configurou. O time não precisa tocá-lo.

| Arquivo         | Função                                                    |
| --------------- | --------------------------------------------------------- |
| `src/index.ts`  | Código-fonte TypeScript do robô                           |
| `dist/index.js` | Código compilado que o GitHub executa                     |
| `action.yml`    | Define os inputs aceitos (`ai_api_key`, `ai_model`, etc.) |

---

### 🏗️ `meu-projeto-backend` — O que o time precisa fazer

O time precisa criar **apenas um arquivo** no projeto deles:

**Caminho:** `.github/workflows/ai-reviewer.yml`

```yaml
name: "AI Code Review"

on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created] # Permite re-executar com o comando /ai-review

permissions:
  contents: read
  pull-requests: write # Necessário para o bot postar comentários no PR

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Revisar com IA
        uses: Digital-Analytics-Apps/ai-code-reviewer@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }} # Gerado automaticamente pelo GitHub
          ai_api_key: ${{ secrets.AI_API_KEY }} # Você cria nos Secrets do projeto
          ai_model: "gpt-4o"
```

E criar o secret `AI_API_KEY` em:
`Settings > Secrets and variables > Actions > New repository secret`

---

## Sobre os Tokens: Não se Confunda

| Token          | Quem gera                          | Onde fica                        | Para que serve                         |
| -------------- | ---------------------------------- | -------------------------------- | -------------------------------------- |
| `GITHUB_TOKEN` | **GitHub automaticamente**         | Em todo repo, sempre disponível  | Postar comentários no PR, ler o código |
| `AI_API_KEY`   | **Você** (OpenAI, Anthropic, etc.) | Secrets do `meu-projeto-backend` | Chamar a IA para fazer a análise       |

> ⚠️ **Importante:** O `AI_API_KEY` deve ser criado nos Secrets do **projeto que será revisado**, não no `ai-code-reviewer`.

---

## Analogia Final

Pensa no `ai-code-reviewer` como um **pacote npm publicado**. O `meu-projeto-backend` simplesmente o **instala e usa** — sem precisar copiar ou entender o código interno. A diferença é que em vez de `npm install`, você usa `uses:` no YAML do GitHub Actions.

---

## 🔐 Permissões: Você Precisa Configurar Algo?

**Não.** Nenhuma configuração de permissão é necessária além do que já está no workflow.

As permissões são declaradas diretamente no arquivo YAML do projeto que usa a Action:

```yaml
permissions:
  contents: read         # Lê o código do repositório para buscar o diff
  pull-requests: write   # Posta os comentários de revisão inline no PR
```

Essas duas linhas são tudo que o bot precisa — e elas já estão incluídas no workflow de exemplo.

> ⚠️ **Atenção:** Se o bloco `permissions:` for omitido, o GitHub aplica permissões padrão mais restritivas que podem impedir o bot de comentar no PR.

### Como funciona o isolamento por repositório

O `GITHUB_TOKEN` é gerado automaticamente pelo GitHub com **escopo restrito ao repositório onde o workflow está rodando**:

| Pergunta | Resposta |
| -------- | -------- |
| Preciso configurar permissão no `ai-code-reviewer`? | ❌ Não |
| Preciso configurar permissão no GitHub da organização? | ❌ Não |
| As permissões valem para outros repositórios? | ❌ Não — isoladas por execução |
| Onde declaro as permissões? | ✅ No bloco `permissions:` do workflow do próprio projeto |

> 🔒 **Por design do GitHub Actions:** o token gerado para o `meu-projeto-backend` só tem acesso ao `meu-projeto-backend`. O repositório `ai-code-reviewer` não ganha nenhuma permissão no processo. Cada execução recebe seu próprio token isolado, que é descartado ao final do job.

---


## 🏢 Cenários de Uso: GitHub Free vs. On-Premises

### Cenário 1 — GitHub Free (Cloud) ☁️

> Todos os repositórios estão no **GitHub.com**: `ai-code-reviewer` + projetos do time.

Tudo funciona hoje, sem nenhuma mudança. O workflow padrão já está configurado corretamente.

```yaml
runs-on: ubuntu-latest # Runner gratuito do GitHub
uses: Digital-Analytics-Apps/ai-code-reviewer@main # Resolvido automaticamente
```

---

### Cenário 2 — GitHub Enterprise Server (On-Premises) 🏢

> Todos os repositórios estão na **mesma instância GHES**: `ai-code-reviewer` + projetos do time.

Como **ambos os repos vivem na mesma instância**, a referência `uses:` funciona normalmente — sem necessidade de GitHub Connect ou espelhamento externo. As únicas diferenças no workflow são:

#### O que muda no `ai-reviewer.yml` do projeto:

```yaml
# ❌ Antes (GitHub.com)
runs-on: ubuntu-latest

# ✅ Depois (GHES)
runs-on: self-hosted   # Runner configurado internamente pela empresa
```

> O `uses:` permanece com a mesma sintaxe — o GHES resolve internamente dentro da própria instância.

#### Comparativo entre os dois cenários:

| Item                          | GitHub Free (Cloud)           | GHES (On-Premises)                       |
| ----------------------------- | ----------------------------- | ---------------------------------------- |
| `uses:` do `ai-code-reviewer` | ✅ Resolvido pelo github.com  | ✅ Resolvido internamente no GHES        |
| Runners                       | `ubuntu-latest` (gratuito)    | `self-hosted` (configurado pela empresa) |
| `GITHUB_TOKEN`                | ✅ Automático                 | ✅ Automático (idêntico)                 |
| IA na nuvem (OpenAI, etc.)    | ✅ Funciona                   | ⚠️ Depende do compliance da empresa      |
| IA local (Ollama/vLLM)        | ✅ Funciona via `ai_base_url` | ✅ Ideal — runner acessa a rede interna  |

#### Usando IA local no On-Premises (Recomendado para compliance):

Se a empresa não pode enviar código para provedores externos, use o campo `ai_base_url` para apontar para um servidor de IA interno (Ollama, vLLM):

```yaml
- name: Revisar com IA
  uses: Digital-Analytics-Apps/ai-code-reviewer@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    ai_api_key: "qualquer-valor" # Ollama não exige chave real
    ai_model: "llama3:70b"
    ai_base_url: "http://servidor-ia-interno.empresa.com:11434/v1"
```

O runner self-hosted tem acesso à rede interna → acessa o Ollama/vLLM → **zero dados saem da empresa**. 🔒

> 💡 Esta é a grande vantagem da nossa arquitetura OpenAI-Compatible: o código da Action **não muda em nenhum dos dois cenários**. O que muda é apenas a infraestrutura configurada no workflow do projeto.

---

> Desenvolvido com 🥷 por Gilson Russo.
