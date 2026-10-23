<img src="build/icon.png" alt="" width="96" align="right">

# CNC Simulator

Português (Brasil) · [English](README.md)

Simulador de programas CNC, leve e multiplataforma. Lê G-code, usa a **máquina** e o **comando** descritos em JSON (um pós-processador às avessas) e mostra o percurso e a peça usinada em 3D.

> **Estado: 0.3.**
> - **Simulação:** o interpretador roda o programa na máquina e no comando escolhidos e mostra o percurso em 3D, com reprodução, painel de posição e mensagens traduzidas.
> - **Alarmes Fanuc:** param a simulação no bloco com o número da própria máquina. A documentação completa (estrutura, formato dos JSON, roadmap) está no [README em inglês](README.md). Este arquivo resume o essencial.

## Como rodar

```bash
npm install                            # dependências
node node_modules/electron/install.js  # binário do Electron (a partir do Electron 45 o npm install não baixa)
npm run dev          # app desktop com recarga automática
npm run check        # tipos + lint + testes: rode antes de cada commit
npm run lint:fix     # corrige o que o lint conseguir sozinho
npm run server       # modo navegador em http://localhost:5174 (rode npm run build antes)
npm run dist         # instalador do sistema atual em dist/
npm run dist:win     # instalador do Windows (NSIS)
npm run dist:mac     # dmg do macOS, arm64 e x64 (rode num Mac; sem assinatura)
npm run dist:linux   # AppImage e .deb do Linux
npm run icons        # gera de novo build/icon.png e o favicon depois de editar build/icon.svg
```

**`npm run dev` falha com `Cannot read properties of undefined (reading 'handle')`:** a variável `ELECTRON_RUN_AS_NODE=1` está ligada. Algumas extensões do VS Code a ligam. Desligue antes de rodar:
- PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`
- Git Bash: `unset ELECTRON_RUN_AS_NODE`

- **CI:** todo push na `main` e todo pull request rodam o `npm run check`.
- **Release:** enviar uma tag `v*` (`git tag v0.1.0 && git push origin v0.1.0`) gera os instaladores de Windows, macOS e Linux e publica na página Releases do GitHub. Rodando à mão pela aba Actions, eles ficam só como artifacts do run.
- **Atualizações:** o app instalado procura a versão nova ao abrir e em **Ajuda → Procurar atualizações**. No Windows e no AppImage baixa sozinho e instala ao reiniciar; no macOS e no `.deb` avisa e abre a página de download.
- **Relatar problemas:** **Ajuda → Relatar um problema** explica como postar, salva um print da janela em Downloads (e copia) e abre uma issue no GitHub com a versão e o sistema preenchidos.

## Qualidade

`npm run check` precisa passar sem erros e sem avisos. O `npm run build` (e todo script `dist`) roda o check antes e para se algo falhar.

- **Tipos:** TypeScript estrito. Fica na versão 6.0 porque o lint de TypeScript ainda não suporta o TypeScript 7 nativo.
- **Lint:** ESLint 10 com as regras estritas do typescript-eslint (que leem os tipos) e as regras de hooks do React.
- **Testes:** Vitest.
  - O1500 com 9/15/20 dentes: a fresa Ø6 a 3,000 mm do perfil ANSI.
  - Exemplo G42 do manual Romi.
  - Regras da máquina, Macro B e fresadora.
  - Textos em todos os idiomas.

## Máquinas incluídas

- **Romi:**
  - **GL 250 M:** com eixo C.
  - **GL 300:** sem eixo C. G12.1, palavra C ou S2= dão alarme.
  - **D600, D1000 e D1250:** Fanuc 0i-MF, com os códigos G e M dos manuais Romi.
- **Mitsubishi M80:** torno e centro de usinagem genéricos.
  - O torno tem dois comandos: lista de códigos G **2**, como a Fanuc sistema A, e lista **3**, como a Fanuc sistema B.
  - Ponto decimal tipo I: `X1` = 0,001 mm.
  - Ponto decimal em M/S/T/… é ignorado, não dá alarme.
- **Dados a conferir:** o que os manuais não trazem (cursos, rotação máxima, magazine) está marcado como **nota** no JSON da máquina e aparece no painel da máquina.
- **Manuais:** ficam em `docs/manuals/`. Os PDFs são dos fabricantes e não estão no repositório.

## Alarmes do comando

Cada família de comando tem o seu catálogo de alarmes em `configs/alarms/`, e o JSON do comando aponta para ele com `"alarms"`. O catálogo da Fanuc 0i traz os alarmes de programa (P/S) do manual de manutenção, com o número e a mensagem da tela.
- **Verificação mapeada:** vira o alarme da máquina, como `PS0010 IMPROPER G-CODE`, e **para o programa naquele bloco**.
- **Na tela:** o programa mostra a linha do alarme em vermelho e uma faixa sobre a vista 3D.
- **Arquivo e limites:** o formato (`%` no início e no fim, `;` de fim de bloco, número do programa, ponto decimal obrigatório) e os limites (dígitos, aninhamento, número de corretores…) ficam no JSON do comando, como parâmetros.

## Idiomas

- **Código, configurações e documentação:** em inglês.
- **Interface:** em **português (padrão)**, inglês e espanhol.
  - **Desktop:** escolha o idioma no menu **Configurações → Idioma**.
  - **Modo navegador:** escolha no seletor do topo da página.
  - Menus e diálogos nativos acompanham o idioma escolhido.
- **Dicionários:** ficam em `src/i18n/locales/`. Para adicionar um idioma:
  1. copie `pt-BR.ts`;
  2. traduza;
  3. registre o idioma em `LANGUAGES` (`src/i18n/index.ts`).
  - O compilador acusa se faltar ou sobrar alguma chave.
- **Textos nos JSON** (`name`, `description`): podem ser uma string simples ou uma por idioma, como `{ "en": "Live tool", "pt-BR": "Ferramenta acionada" }`. Se faltar o idioma, usa o inglês.

## Licença

Copyright (C) 2026 Ismael Figueiredo

Software livre sob a [GNU General Public License v3.0](LICENSE) ou, a seu critério, qualquer versão posterior. Você pode usar, modificar e redistribuir; quem distribuir uma versão modificada precisa publicar o código-fonte sob a mesma licença.

Os manuais de comandos e máquinas citados aqui pertencem aos fabricantes e não estão cobertos por esta licença.
