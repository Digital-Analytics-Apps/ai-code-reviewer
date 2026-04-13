# 🤖 AI Code Reviewer (GitHub Action)

Uma Custom GitHub Action altamente inteligente que realiza Code Review automático nos Pull Requests da sua organização usando a engine do **Google Gemini 1.5 Flash**.

Essa Action foi desenhada para ser Desacoplada, Inteligente, Extremamente Segura e Altamente Configurável.

---

## 🚀 Como instalar em qualquer repositório
Para colocar a Inteligência Artificial revisando o código de um novo projeto, basta criar um arquivo YAML dentro da pasta `.github/workflows/` (Ex: `ai-review.yml`) com o seguinte conteúdo:

```yaml
name: "AI Code Review"

on:
  pull_request:
    types: [opened, synchronize] # Roda quando um PR é aberto ou atualizado

permissions:
  contents: read
  pull-requests: write # Obrigatório para conseguir postar os comentários no código!

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Executar Especialista IA 🤖
        uses: Digital-Analytics-Apps/ai-code-reviewer@main # Aponta direto pra este repositório!
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
```
**Importante:** Vá até a aba *Settings > Secrets and variables > Actions* do seu repositório de destino e cadastre o `GEMINI_API_KEY`.

---

## 🧠 Master Guidelines e Regras Locais
Este Robô vem com "**Rigor Absoluto OWASP e Clean Code**" de fábrica injetado em sua classe principal.

Apesar dele já ser inteligente, você pode torná-lo hiper-especializado criando regras que refletem as decisões arquiteturais do projeto destino.
Para isso, basta criar a estrura no projeto-alvo:
- `.github/ai-rules/BACKEND.md` -> Para ditar regras quando ele ler pastas `backend`, `api`, `services`.
- `.github/ai-rules/FRONTEND.md` -> Para ditar regras quando ele ler pastas `frontend`, `react`, etc.
*OBS: O robô junta automaticamente as regras do seu projeto local com a sua "Mente Mestra" padrão.*

---

## 🛠️ Como dar manutenção ou criar novas Regras Nativas na Action

Todo o "Cérebro" do robô mora dentro de: `src/index.ts`.
Este arquivo fonte Typescript foi massivamente documentado em pt-BR de forma didática.

### 👉 Modificando o comportamento
1. Faça clone/abra este repositório localmente.
2. Abra `src/index.ts`.
3. Edite o que precisa (Ex: mude o *modelo* do Gemini de 1.5 para 2.0, adicione nova verificação de tamanho, otimize os prompts da `MASTER_GUIDELINES`, etc).

### ⚙️ Como Compilar e Publicar ("Como Miletar o Bicho")
Para o ecossistema do GitHub Actions funcionar com *TypeScript*, nós não podemos simplesmente enviar o `src/` puro. Precisamos "empacotar" (buildar) todas as lógicas e as pastas do "node_modules" em um único arquivo de distribuição. 

Se você mexeu no `src/index.ts`, **OBRIGATORIAMENTE** rode esse script antes de dar push:

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

---

> Desenvolvido com 🥷 por Agent Antigravity e Gilson Russo.
