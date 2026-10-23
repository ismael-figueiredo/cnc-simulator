<img src="build/icon.png" alt="" width="96" align="right">

# CNC Simulator

Português (Brasil) · [English](README.md)

Simulador de programas CNC, leve e multiplataforma. Lê G-code, usa a **máquina** e o **comando** descritos em JSON (um pós-processador às avessas) e mostra o percurso em 3D, com os alarmes do próprio comando.

![O exemplo O1500 rodando: tela de programa estilo Fanuc, percurso 3D com compensação de raio, posição absoluta e de máquina](docs/demo.gif)

## Baixar

Os instaladores de cada versão estão na **[página de Releases](https://github.com/ismael-figueiredo/cnc-simulator/releases/latest)**:

| Sistema | Arquivo | Observação |
|---|---|---|
| Windows 10/11 | `cnc-simulator-<versão>-setup.exe` | O Windows pode avisar "editor desconhecido" (o app não é assinado): **Mais informações → Executar assim mesmo**. As atualizações se instalam sozinhas. |
| macOS (Apple Silicon, M1 ou mais novo) | `cnc-simulator-<versão>-arm64.dmg` | Arraste para Aplicativos. Na primeira vez: botão direito no app → **Abrir** (não é assinado). |
| macOS (Intel) | `cnc-simulator-<versão>-x64.dmg` | Igual ao de cima. |
| Linux | `cnc-simulator-<versão>-x86_64.AppImage` ou `cnc-simulator_<versão>_amd64.deb` | O AppImage se atualiza sozinho; o .deb atualiza instalando o novo. |

## O que faz

- **Roda o G-code como o comando:** dialetos Fanuc e Mitsubishi em JSON, Macro B (variáveis, IF/WHILE/GOTO, G65), subprogramas, ciclos fixos, interpolação polar G12.1 e compensação de raio G41/G42 desenhada no centro da ferramenta.
- **Para nos alarmes da máquina:** erros de programa param no bloco com o número e a mensagem do próprio comando (por exemplo `PS0010 IMPROPER G-CODE`).
- **Tela de programa como a do comando:** tela MEM estilo Fanuc com o bloco em execução, números O e N e estado de execução. **EDIT** vira um editor (cores, desfazer, buscar e substituir).
- **Projetos (`.cncsim`):** guardam o programa com máquina, comando, ferramentas, blank e zeros, para reabrir ou enviar o trabalho inteiro.
- **Ferramentas:** criar e editar ferramentas, salvar como biblioteca e reutilizar em qualquer projeto.
- **Blank:** barra ou bloco, medidas, posição e cor do material.
- **Zeros de peça:** G54–G59 e G54.1 P n, G10 L2/L20 no programa, G53 em coordenadas de máquina, posição absoluta e de máquina lado a lado e aviso de fim de curso.
- **Menu Ajuda:** relatar um problema (com print e issue preenchida no GitHub) e procurar atualizações.
- **Idiomas:** português (Brasil), inglês e espanhol.

## Como usar

1. **Tela inicial:** abra um programa (`.nc`, `.tap`, `.txt`…) ou um projeto, crie um programa novo ou abra o **Exemplo** (coroa ANSI 40 num Romi GL 250 M). Os arquivos recentes ficam aqui e em **Arquivo → Abrir recente**.
2. **Escolha a máquina e o comando** no topo. Um programa aberto sozinho usa o blank da máquina e as ferramentas padrão.
3. **Execute:** o programa abre em RESET, com o cursor no primeiro bloco, como no comando. **▶ Executar** roda; ◀ e ▶| andam bloco a bloco; **RESET** volta ao início e ⏭ vai ao fim. **Clique num bloco para começar dele.** Mensagens e alarmes ficam à direita; clique numa para ir ao bloco.
4. **EDIT / MEM:** EDIT altera o programa; MEM roda como está. **Arquivo → Salvar** (Ctrl/⌘+S) grava.
5. **Preparação:** no painel da direita, edite o **Blank**, os **Zeros de peça** e as **Ferramentas** e use **Salvar como projeto** para guardar tudo num `.cncsim` ao lado do programa.

### Zeros de peça: o que muda na simulação

- **Um zero só:** o percurso não muda em relação à peça. Os valores dele (posição de máquina do zero peça) posicionam o zero de máquina, e aí a coluna **Máquina**, o G53/G28 e a conferência de curso passam a ser reais.
- **Vários zeros** (duas morsas, duas faces): cada um é desenhado deslocado pela diferença para o G54, e o blank fica no zero que você escolher.
- **G10 L2 / L20** no programa gravam a tabela durante a execução, como na máquina.
- **Ainda não:** comprimento de ferramenta (G43 H) e desgaste; o aviso de curso diz isso.

### Relatar problemas

**Ajuda → Relatar um problema** explica como postar, salva um print da janela em Downloads (e copia) e abre uma [issue no GitHub](https://github.com/ismael-figueiredo/cnc-simulator/issues) com a versão e o sistema já preenchidos. **Ajuda → Problemas conhecidos** abre a lista de issues.

# Para desenvolvedores

A documentação completa (estrutura, formato dos JSON, roadmap) está no [README em inglês](README.md). Este arquivo resume o essencial.

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
npm run icons        # gera de novo build/icon.png, o favicon e as imagens do instalador depois de editar build/icon.svg
npm run demo         # grava o docs/demo.gif (tela inicial + exemplo rodando) para o README
```

Depois de uma mudança visível na interface, rode `npm run demo` e faça o commit do `docs/demo.gif` novo junto, para o README mostrar o app atual.

**`npm run dev` falha com `Cannot read properties of undefined (reading 'handle')`:** a variável `ELECTRON_RUN_AS_NODE=1` está ligada. Algumas extensões do VS Code a ligam. Desligue antes de rodar:
- PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`
- Git Bash: `unset ELECTRON_RUN_AS_NODE`

- **CI:** todo push na `main` e todo pull request rodam o `npm run check`.
- **Release:** enviar uma tag `v*` (`git tag v0.1.0 && git push origin v0.1.0`) gera os instaladores de Windows, macOS e Linux e publica na página Releases do GitHub. Rodando à mão pela aba Actions, eles ficam só como artifacts do run.
- **Atualizações:** o app instalado procura a versão nova ao abrir e em **Ajuda → Procurar atualizações**. No Windows e no AppImage baixa sozinho e instala ao reiniciar; no macOS e no `.deb` avisa e abre a página de download.

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
