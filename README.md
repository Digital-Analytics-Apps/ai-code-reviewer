# 🤖 AI Code Reviewer (GitHub Action)

Bem-vindo(a) ao **AI Code Reviewer**! Este guia foi feito para você, desenvolvedor ou líder técnico, que quer colocar nossa Inteligência Artificial para fiscalizar, formatar e garantir a qualidade máxima dos repositórios da sua equipe.

O robô trabalha perfeitamente nos "Pull Requests". Em vez de você gastar dezenas de minutos analisando vulnerabilidades bestas de sintaxe ou _magic strings_, a IA fará essa primeira passagem como num pente-fino, colocando anotações diretas nas linhas alteradas do Github.

> **Engenheiros e Mantenedores da Ferramenta**: se você precisa dar manutenção no código-fonte em Typescript, aprender a re-compilar (**buildar**) a action ou quer explicações aprofundadas da nossa arquitetura de Zero-Telemetria, acesse o nosso descritivo técnico em [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Passo a Passo da Configuração

### 1. Preparando o Terreno (Secrets)

No Github do repositório onde a Action for rodar, você precisará definir a chave de acesso do provedor de IA escolhido.

1. Vá até a aba superior do Github em: `Settings > Secrets and variables > Actions`.
2. Clique em **New repository secret**.
3. **Nome:** `AI_API_KEY`
4. **Valor:** `<cole sua chave da OpenAI, Anthropic, Gemini, etc, aqui!>`

### 2. Adicionando o Pente-Fino (Workflow)

Naquele mesmo repositório, crie um arquivo YAML: `.github/workflows/ai-reviewer.yml`. Copie e cole o código abaixo (essa é a receita mágica):

```yaml
name: "AI Code Review"

on:
  pull_request:
    types: [opened, synchronize] # Executa só quando alguém abre ou atualiza um PR
  issue_comment:
    types: [created] # Executa de novo se você comentar "/ai-review" no PR!

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
          github_token: ${{ secrets.GITHUB_TOKEN }}
          ai_api_key: ${{ secrets.AI_API_KEY }}
          ai_model: "gpt-4o" # Mude para 'gemini-1.5-pro' ou afins livremente
```

---

## 🔒 Provedores Intranet e Segurança Avançada (Ollama)

Se o compliance de segurança da sua empresa não permitir que o código do projeto vá para Nuvem ou terceiros (como OpenAI API), não tem problema! Como nossa Action foi arquitetada para ser 100% **OpenAI-Compatible**, você pode interligar nosso sistema direto a um servidor de IA hospedado localmente (Ex: Ollama ou vLLM).

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

Por padrão, a ferramenta aplica **Rigor Absoluto e Práticas OWASP (Segurança)**. No entanto, o seu time pode ter padrões próprios! (Ex: "Todo o código Front exige ser retornado usando Zustand e React Memos").

Aqui está como injetar as suas regras organizacionais na IA:

### Método A: Arquivo Global (Fácil - Recomendado)

A Action buscará automaticamente esse arquivo caso não tenha recebido ordens diretas. Crie o arquivo na raiz do projeto: `.github/ai-reviewer-rules.md`.

Conteúdo exemplo de `.github/ai-reviewer-rules.md` utilizando a melhor prática para injeção de _Skills_ via Prompt Engineering:

```markdown
<identity>
Você é um Engenheiro de Software Sênior especialista na arquitetura da ACME Inc. Seu objetivo é fiscalizar minuciosamente os Pull Requests do nosso time, garantindo performance, segurança e padronização.
</identity>

<tech_stack>

- Backend: Node.js com NestJS e TypeScript estrito.
- Banco de Dados: PostgreSQL utilizando Prisma ORM.
- Frontend: React (Next.js App Router) e TailwindCSS.
- Testes: Jest para unitários e Cypress para E2E.
  </tech_stack>

<best_practices>
<backend_node> - Priorize a legibilidade ("Clean Code") ao invés de micro-otimizações prematuras. - Utilize o padrão "Early Return" sempre que possível para reduzir o aninhamento.
</backend_node>

<frontend_react> - Se a alteração envolver lógicas complexas no useEfect, sugira a extração para um Custom Hook. - Componentes devem ser estritamente Desacoplados de regras de negócio.
</frontend_react>
</best_practices>

<rules>
- É ESTRITAMENTE PROIBIDO o uso de tipagens `any` ou `@ts-ignore`. Se houver no diff, dê FAIL imediato (BLOCKING).
- Não autorize chaves de API cruas (hardcoded) nos arquivos; exija variáveis de ambiente.
- Ignorar sumariamente qualquer arquivo gerado automaticamente (ex: `schema.prisma`, pacotes dist/).
</rules>

<communication_style>
Seja direto e muito educado. Se apontar um erro, mostre em markdown um "Exemplo de como deveria ser" utilizando a nossa Tech Stack para resolver.
</communication_style>
```

> 💡 **Dica Pro: Injetando Documentações Oficiais ("Knowledge Injection")**
> Os Modelos de IA modernos suportam "Context Windows" muito grandes. Se o seu projeto usa Angular, Vue ou um Framework de Arquitetura da sua própria empresa, você não precisa resumir as regras. **Copie e cole integramente** textos oficias descritos no portal do desenvolvedor (Ex: [Angular Style Guide](https://angular.dev/style-guide)) e jogue diretamente dentro da tag `<best_practices>`. O robô processará como se tivesse lido aquele manual antes de revisar cada linha de código!

### Método B: Diretamente Via YAML (Hardcoded)

Caso não queira criar um arquivo, passe um texto puro ou direcione o caminhamento de regras pela Action:

```yaml
with:
  # ... restou do script ...

  # Regras Rápidas:
  custom_rules: "Somente revise arquivos backend. E recuse nomes de funções em português."

  # Ou um arquivo isolado em outra pasta
  rules_path: ".arquitetura/guidelines_senior_team.md"
```

## Como a IA Vai Trabalhar? (Gabarito de Mensagens)

Quando o desenvolvedor mandar as alterações, a IA fará leituras precisas inline com **EMOJIs de Severidade**.

- 🔴 **BLOCKING:** Problemas críticos de segurança (Senhas nos logs e injeções de SQL).
- 🟡 **SUGGESTION:** Má gestão da sintaxe e refatorações puras do Clean Code.
- 🟢 **NIT:** Padrões bobos, nomes esquisitos ou desalinhamentos mentais leves.
- ❓ **QUESTION:** Abordagens de extrema complexidade que exijam uma explicação no Code Review (Ex: Algoritmos customizáveis lentos O(N^2)).

### 🔄 Quero que a IA revise tudo de novo!

Fez uma muitos commits de refatoração, a action original falhou por indisponibilidade temporária ou você simplesmente quer uma segunda opinião?
Basta comentar no Pull Request o comando:
**`/ai-review`**
O robô interceptará sua mensagem e começará uma re-leitura silenciosa imediatamente.

Bons Códigos! 🥷

> Desenvolvido com 🥷 por Agent Antigravity e Gilson Russo.
