<img src="build/icon.png" alt="" width="96" align="right">

# CNC Simulator

Português (Brasil) · [English](README.md)

[![Release](https://img.shields.io/github/v/release/ismael-figueiredo/cnc-simulator)](https://github.com/ismael-figueiredo/cnc-simulator/releases/latest) [![Downloads](https://img.shields.io/github/downloads/ismael-figueiredo/cnc-simulator/total)](https://github.com/ismael-figueiredo/cnc-simulator/releases) [![CI](https://github.com/ismael-figueiredo/cnc-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/ismael-figueiredo/cnc-simulator/actions/workflows/ci.yml) [![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

**Simulador CNC gratuito e de código aberto para aprender e testar G-code** sem precisar de uma máquina: tornos e centros de usinagem, comandos Fanuc, Mitsubishi e Haas, programas parametrizados em Macro B, os alarmes do próprio comando e a verificação de colisões. Para Windows, macOS e Linux.

Site: **[ismael-figueiredo.github.io/cnc-simulator/pt](https://ismael-figueiredo.github.io/cnc-simulator/pt/)** · [Códigos G e M explicados](https://ismael-figueiredo.github.io/cnc-simulator/pt/codigos-g/)

Lê G-code, usa a **máquina** e o **comando** descritos em JSON (um pós-processador às avessas) e mostra o percurso e a peça usinada em 3D.

![O exemplo O2001 sendo usinado no layout de máquina: posição, rotação e avanço em cima, percurso 3D e o programa rodando, softkeys e o painel de operação embaixo](docs/demo.gif)

## Para quem é

- **Quem está aprendendo CNC:** escreva o programa, rode bloco a bloco, veja o que cada código faz e qual alarme o comando daria, sem arriscar a máquina.
- **Programadores:** confira o que o pós-processador do CAM gerou antes de chegar na máquina: alarmes, fim de curso, colisão de suporte e de placa, corretores.
- **Professores e escolas técnicas:** uma ferramenta gratuita que cada aluno instala em casa, com exemplos prontos de torno e centro de usinagem.
- **Programação parametrizada:** aprenda e teste Macro B (variáveis, IF/WHILE, G65) no simulador antes de levar para o comando.

## Baixar

Os instaladores de cada versão estão na **[página de Releases](https://github.com/ismael-figueiredo/cnc-simulator/releases/latest)**:

| Sistema | Arquivo | Observação |
|---|---|---|
| Windows 10/11 | `cnc-simulator-<versão>-setup.exe` | O Windows pode avisar "editor desconhecido" (o app não é assinado): **Mais informações → Executar assim mesmo**. As atualizações se instalam sozinhas. |
| macOS (Apple Silicon, M1 ou mais novo) | `cnc-simulator-<versão>-arm64.dmg` | Arraste para Aplicativos. Na primeira vez: botão direito no app → **Abrir** (não é assinado). |
| macOS (Intel) | `cnc-simulator-<versão>-x64.dmg` | Igual ao de cima. |
| Linux | `cnc-simulator-<versão>-x86_64.AppImage` ou `cnc-simulator_<versão>_amd64.deb` | O AppImage se atualiza sozinho; o .deb atualiza instalando o novo. |

## O que faz

- **Roda o G-code como o comando:** dialetos Fanuc, Mitsubishi e Haas em JSON, Macro B (variáveis, IF/WHILE/GOTO, G65), subprogramas, ciclos fixos, interpolação polar G12.1 e compensação de raio G41/G42 desenhada no centro da ferramenta.
- **Programas parametrizados (Macro B):** variáveis, contas e IF/GOTO/WHILE rodam como no comando, em todas as máquinas incluídas (todos os comandos delas têm a opção de macro). G-code comum e os ciclos fixos do próprio comando também; os exemplos têm os dois.
- **Para nos alarmes da máquina:** erros de programa param no bloco com o número e a mensagem do próprio comando (por exemplo `PS0010 IMPROPER G-CODE`).
- **Painel de operação:** bloco a bloco, parada opcional M01, salto de bloco "/", override de avanço e de rápido (o tempo de ciclo acompanha) e pontos de parada em qualquer linha.
- **Tela como a da máquina:** a tela **Máquina** é montada como um comando (sem marcas de fabricante): o display com a barra de título (página, MEM/EDIT, STRT/HOLD, ALM), posição com coordenadas de máquina e distância a ir, rotação e avanço com barras e overrides, o programa; as **softkeys** embaixo; o **teclado MDI** ao lado (POS, PROG, OFS/SET, SYSTEM, MESSAGE e GRAPH trocam a página; RESET; o cursor e o PAGE andam pelo programa); e o **painel de operação** abaixo: MODE (EDIT/MEM), **CYCLE START** e **FEED HOLD**, SINGLE BLOCK, OPT STOP, BLOCK SKIP e os **knobs de override de avanço, rápido e árvore**. Um alarme aparece no alto da tela com o número e o texto curto; a página MESSAGE tem a mensagem completa. Teclado: **Espaço** cycle start / feed hold, **Esc** reset, **S** bloco a bloco. A velocidade e a linha do tempo da simulação ficam à parte, embaixo do painel.
- **Modelo 3D, como nos programas de CAD:** uma **árvore** à esquerda (programa, máquina, blank, zeros, ferramentas, as operações que o programa faz e as mensagens; clique numa operação para ir até ela e destacá-la no 3D), o programa abaixo dela, e o modelo com uma **barra de vistas** (ajustar, iso/topo/frente/lateral, o que mostrar, ortográfica ou perspectiva, seguir ferramenta, medir) e um **cubo de vistas** para clicar. As vistas são exatas (Topo e Frente ficam realmente planas) e a câmera é **ortográfica** por padrão; **F** ajusta a peça na tela. A **linha do tempo** abaixo do controle deslizante tem a cor de cada ferramenta e marca paradas M00/M01, pontos de parada, colisões e o alarme; um alarme também aparece como uma linha vermelha no alto da vista.
- **Imagem da peça pronta:** os exemplos, os exercícios e os arquivos recentes mostram uma pequena imagem 3D da peça que o programa faz, para saber do que se trata antes de abrir; a árvore do documento também mostra, e **Peça acabada** na barra de vistas mostra o blank como o programa inteiro deixa.
- **Tour do primeiro uso:** um passeio curto pela tela na primeira vez que um programa abre, e de novo pelo **?** no canto superior direito (com o modo aprender e os atalhos de teclado).
- **Modo aprender (?):** passe o mouse num código G/M, numa #variável ou numa palavra de macro do programa (ou do editor) para ver o que ela faz no comando escolhido; o bloco do cursor é explicado palavra por palavra abaixo do programa. G71 no torno Fanuc, M97 na Haas: a ajuda segue o comando.
- **Exercícios guiados:** quatro exercícios na tela inicial, de um eixo com G00/G01 a uma fileira de furos com WHILE. Cada um abre com a máquina, o blank, o enunciado e um desenho da peça; **Conferir** usina o seu programa e a solução no mesmo blank e diz onde ficou material ou onde a peça foi cortada a mais.
- **Tela de programa como a do comando:** tela MEM estilo Fanuc com o bloco em execução, números O e N e estado de execução. **EDIT** vira um editor (cores, desfazer, buscar e substituir); ele para o programa que estiver rodando, e o percurso, as mensagens e os alarmes acompanham o texto enquanto você digita.
- **Corretores de ferramenta:** tela OFFSET com H/D (centro de usinagem) ou X/Z, raio e direção de ponta (torno), geometria e desgaste; um H errado desloca a ponta como na máquina; compensação do raio da ponta G41/G42 no torno.
- **Ciclos de torno:** desbaste G71/G72, repetição de perfil G73 e acabamento G70 a partir do perfil entre P e Q; ciclos simples G90/G94/G92 (sistema A) e G77/G79/G78 (sistema B); rosca G76 em várias passadas e G32/G33 com avanço pelo passo. A barra é usinada passe a passe.
- **Chanfro e raio de canto automáticos:** `,C` e `,R` em qualquer ângulo, com o arco tangente seguido pela compensação de raio, e os alarmes do comando quando não dá para fazer. No torno também aceita `C`/`R` sem vírgula (opção `cornerWithoutComma` do comando).
- **Projetos (`.cncsim`):** guardam o programa com máquina, comando, ferramentas, blank e zeros, para reabrir ou enviar o trabalho inteiro.
- **Ferramentas em 3D:** cada ferramenta é desenhada pelo tipo e pelas medidas, com o suporte e o nariz do fuso em transparência no centro de usinagem. As ferramentas rotativas giram com a árvore (M03/M04 até o M05, mais rápido com o S e o override da árvore) e, no torno, com a ferramenta acionada. Os cones mostram o rasgo em V do flange, o cone 7:24 (BT, CAT, SK; cone curto HSK) com o tirante e a porca da pinça ER; fresas e brocas mostram a hélice dos canais, e o cabeçote fresador os insertos. As ferramentas de tornear mostram o inserto ISO (trigon WNMG, pastilha de rosca deitada com a ponta de 60° de frente para a peça) com o parafuso de fixação no suporte de haste quadrada, a barra de mandrilar nas internas, ou a lâmina do bedame.
- **Visão de usinagem:** o blank muda de cor e de forma onde a ferramenta corta: mapa de alturas no bloco (fresas reta e esférica) e o perfil torneado na barra. Os furos dos ciclos de furação saem redondos, com parede reta, e a superfície acompanha as bordas de contornos e bolsões. Rápidos e ferramenta acionada no torno ainda não cortam nesta visão.
- **Placa, mesa e morsa:** o torno mostra uma placa hidráulica de três castanhas (corpo, ranhuras, castanhas duras escalonadas) e o centro de usinagem uma mesa com ranhuras T e a morsa prendendo o blank, os dois com as medidas do arquivo da máquina. A mesa fica onde o G54 põe a peça na máquina, ou logo abaixo do blank sem zeros de peça. **Placa** / **Mesa e morsa** na barra de vistas esconde.
- **Possíveis colisões:** quando o suporte entra no blank (a ferramenta está pouco para fora para a profundidade), o bloco aparece nas mensagens e o suporte fica vermelho. No torno, uma ferramenta que chega nas castanhas ou no corpo da placa aparece nas mensagens e as castanhas ficam vermelhas.
- **Blank:** ajustar ao que o programa corta com um clique, e escolher se o zero peça fica num canto ou no centro do bloco.
- **Contraponta:** tornos com `tailstock` no arquivo da máquina mostram centro rotativo, mangote e corpo do lado oposto à placa. Na Romi GL, **M27** encosta o contraponto na peça e **M26**/**M31** recuam (manual, seção 11.3.4); facear até o centro ou sair pelo eixo com ele encostado aparece como colisão.
- **Visão da máquina no torno:** a placa e a peça giram em C e a ferramenta fica em X/Z, como na máquina; a placa gira quando está torneando.
- **Ferramentas:** criar e editar ferramentas (montagem, lado, mão, inserto; hélice e inserto desenhados no editor), salvar como biblioteca e reutilizar em qualquer projeto.
- **Blank:** barra ou bloco, medidas, posição e cor do material.
- **Zeros de peça:** G54–G59 e G54.1 P n, G10 L2/L20 no programa, G53 em coordenadas de máquina, posição absoluta e de máquina lado a lado e aviso de fim de curso.
- **Menu Ajuda:** relatar um problema (com print e issue preenchida no GitHub) e procurar atualizações.
- **Idiomas:** português (Brasil), inglês e espanhol.

## Como usar

1. **Tela inicial:** **Novo programa…** e **Abrir…** à esquerda; as abas **Recentes**, **Exemplos** e **Exercícios** à direita. Cada documento abre na sua **aba**, como num navegador: vários programas lado a lado, cada um com sua máquina e simulação (Ctrl/⌘+W fecha a aba, **+** volta à tela inicial). Dois tipos de arquivo: o **projeto (.cncsim)** guarda o programa com máquina, comando, blank, ferramentas e zeros; o **programa (.nc, .tap, .txt…)** é só o G-code.
2. **Máquina e comando:** um programa aberto sozinho pergunta antes a máquina, o comando e a biblioteca de ferramentas, com uma sugestão tirada dos próprios códigos (G18 e T0101 → torno, G154 → Haas…), para não abrir cheio de alarmes na máquina errada. Um projeto abre como foi salvo. A **barra de status** embaixo mostra o tipo de arquivo, a máquina, o comando e as ferramentas, e troca a máquina e o comando.
3. **Execute:** o programa abre em RESET, com o cursor no primeiro bloco, como no comando. **▶ Executar** roda; ◀ e ▶| andam bloco a bloco; **RESET** volta ao início e ⏭ vai ao fim. **Clique num bloco para começar dele**, ou **no número da linha** para parar ali (ponto de parada). Embaixo do player: **BLOCO A BLOCO**, **M01**, **SALTO DE BLOCO /** e os **overrides de avanço e de rápido**. Os códigos G ativos, F, S, T e o ciclo fixo aparecem acima do programa. Mensagens e alarmes ficam à direita (página MENSAGEM na tela de máquina); clique numa para ir ao bloco.
4. **EDIT / MEM:** EDIT altera o programa e para a execução se estiver rodando; enquanto você digita, o percurso e as mensagens são recalculados (o programa volta para RESET). MEM roda como está. **Arquivo → Salvar** (Ctrl/⌘+S) grava.
5. **Preparação:** no painel da direita (páginas AJUSTES e OFFSET na tela de máquina), edite o **Blank** (ou gere pelo programa e escolha onde fica o zero peça nele), os **Zeros de peça** e as **Ferramentas** e use **Salvar como projeto (.cncsim)** para guardar tudo ao lado do programa. O disquete acima do programa salva só o programa (`.nc`).

### Aprenda com os exemplos

Comece pelos **exercícios** da tela inicial (E01 a E04, com **Conferir**) e depois abra os exemplos, nesta ordem:

| Exemplo | Máquina | O que ensina |
|---|---|---|
| **O1001** eixo escalonado | Torno Romi GL 300 | Faceamento, passes de desbaste à mão, acabamento com chanfro `,C` e raio `,R` automáticos, canal |
| **O1002** eixo roscado | Torno Romi GL 300 | A mesma peça com ciclos: desbaste G71, acabamento G70, rosca G76 |
| **O2001** placa | Centro de usinagem Romi D600 | Faceamento, contorno com G41, bolsão, ciclos de furação e roscamento G81/G83/G84, gravação |
| **O2002** duas morsas | Centro de usinagem Romi D600 | Zeros G54 e G55, subprogramas M98/M99, coordenadas de máquina |
| **O3001** duas fixações | Haas VF-2 | O mesmo trabalho na Haas: zeros G154 e subprogramas locais M97 |
| **O1500** coroa | Torno Romi GL 250 M | Programa parametrizado completo em Macro B, com ferramenta acionada e G12.1 |

### Antes de mandar o programa para a máquina

| O que conferir | Onde aparece |
|---|---|
| Erros de programa (código errado, palavra faltando, arco inválido) | Alarme vermelho com o número do comando, no bloco |
| Fim de curso | Aviso com o eixo e o bloco, pelos cursos da máquina |
| Suporte entrando no blank, ferramenta batendo na placa | Lista de colisões; o suporte ou as castanhas ficam vermelhos no 3D |
| H ou D errado, corretor faltando | Tabela OFFSET e avisos; um H errado desloca a ponta como na máquina |
| Tempo de ciclo | Abaixo da posição, acompanhando os overrides de avanço e rápido |

### Programação parametrizada (Macro B)

Todos os comandos incluídos (Fanuc 0i-TF, 0i-MF, linha Romi D, Mitsubishi M80 torno e centro de usinagem, Haas NGC fresadora) têm a opção de macro, então isto roda no simulador como na máquina:

- **Variáveis:** locais `#1–#33`, comuns `#100–#199` e `#500–#999`, e variáveis de sistema como `#5001–#5003` (posição absoluta) e `#5021–#5023` (posição de máquina).
- **Contas e funções:** `+ - * /`, `SIN COS TAN ASIN ACOS ATAN SQRT ABS ROUND FIX FUP`, colchetes.
- **Desvios e laços:** `IF [...] GOTO n`, `IF [...] THEN`, `WHILE [...] DOn … ENDn`, com `EQ NE GT LT GE LE AND OR`.
- **Chamadas:** `G65 P… A… B…` com argumentos, subprogramas `M98`/`M99` no mesmo arquivo.
- **Alarmes:** `#3000 = n (mensagem)` para a execução com o número de alarme do comando.

**Arquivo → Novo programa** pergunta se é **G-code comum** ou **parametrizado**. Os dois começam com um cabeçalho escrito nos códigos do comando escolhido (unidade, plano, cancelamentos de segurança, primeira ferramenta, fuso, refrigeração, fim do programa e `;` no fim dos blocos quando o comando exige). O parametrizado acrescenta parâmetros para alterar (`#100…`) e um laço `WHILE` que faz os passes até a profundidade.

O exemplo **O1500** é um programa parametrizado completo (coroa ANSI 40 calculada a partir do número de dentes); **O2001** e **O2002** são G-code comum com ciclos fixos (G81, G83, G84) e subprogramas; **O3001** é a versão Haas, com zeros G154 e subprogramas locais M97.

### Zeros de peça: o que muda na simulação

- **Mudar um zero desloca o corte, não a peça:** o blank fica preso na mesa, como na máquina. Subir o Z do G54 em 5 mm corta 5 mm mais alto (no ar, se o programa só descia 2 mm); mexer em X desloca o rasgo na peça. Desmarque **O blank fica preso na mesa** no editor de zeros para o blank acompanhar o zero (corrigir onde a peça realmente está). Os valores também posicionam o zero de máquina, então a coluna **Máquina**, o G53/G28 e a conferência de curso são reais.
- **Vários zeros** (duas morsas, duas faces): cada um é desenhado deslocado pela diferença para o G54, e o blank fica no zero que você escolher.
- **G10 L2 / L20** no programa gravam a tabela durante a execução, como na máquina.
- **Corretores também contam:** o G43 H põe a linha de referência do fuso em Z + H, então posição de máquina e conferência de curso são reais; veja abaixo.

### Corretores de ferramenta

**Corretores de ferramenta** (painel da direita) é a tela OFFSET do comando, salva no projeto e preenchida no início pelas ferramentas (comprimento = suporte + ferramenta, raio, raio de ponta).

- **Centro de usinagem:** o `G43 H` lê o comprimento, o `G41/G42 D` o raio; o desgaste soma à geometria. Se o H não for o comprimento real da ferramenta no fuso, a ponta é desenhada onde ela vai de verdade (um H menor entra mais fundo) e um aviso mostra a diferença. Cortar sem G43 também gera aviso.
- **Torno:** a palavra T escolhe o corretor (`T0101` → 01). O desgaste X/Z desloca a ponta, R e T (direção de ponta) entram na **compensação do raio da ponta** G41/G42, e a geometria entra na posição de máquina.
- **G10** grava corretores durante a execução: L10–L13 no centro de usinagem, `G10 P n` (desgaste) e `P 10000+n` (geometria) no torno.

### Relatar problemas

**Ajuda → Relatar um problema** explica como postar, salva um print da janela em Downloads (e copia) e abre uma [issue no GitHub](https://github.com/ismael-figueiredo/cnc-simulator/issues) com a versão e o sistema já preenchidos. **Ajuda → Problemas conhecidos** abre a lista de issues.

### Comunidade

- **Dúvidas e programas:** [Discussions](https://github.com/ismael-figueiredo/cnc-simulator/discussions), para dúvidas de programação e para mostrar o que você fez.
- **Uma máquina ou um comando que você precisa:** abra um [pedido de máquina ou comando](https://github.com/ismael-figueiredo/cnc-simulator/issues/new?template=machine.yml).
- **Contribuir:** máquinas, comandos e alarmes são arquivos JSON; o [CONTRIBUTING.md](CONTRIBUTING.md) explica como adicionar.

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
npm run icons        # gera de novo build/icon.png, o favicon, as imagens do instalador e docs/social.png depois de editar build/icon.svg
npm run demo         # grava o docs/demo.gif (tela inicial + exemplo rodando) para o README
```

Depois de uma mudança visível na interface, rode `npm run demo` e faça o commit do `docs/demo.gif` novo junto, para o README mostrar o app atual.

**`npm run dev` falha com `Cannot read properties of undefined (reading 'handle')`:** a variável `ELECTRON_RUN_AS_NODE=1` está ligada. Algumas extensões do VS Code a ligam. Desligue antes de rodar:
- PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`
- Git Bash: `unset ELECTRON_RUN_AS_NODE`

- **CI:** todo push na `main` e todo pull request rodam o `npm run check`.
- **Notas de versão:** cada versão está descrita no [CHANGELOG.md](CHANGELOG.md) (português e inglês). Crie a tag anotada com esse texto como mensagem (`git tag -a vX.Y.Z --cleanup=verbatim -F notas.md`, para manter os títulos `###`); o workflow Release coloca o texto na página do release.
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
- **Haas VF-2 e VF-5/40:** comando Haas NGC fresadora.
  - `G154 P1`–`P99` e `G110`–`G129` (`G154 P1`–`P20`) são os mesmos zeros do `G54.1 P n`. No `G10 L20 G154 P n` o G154 só diz qual zero é escrito.
  - `M97 P n` chama um subprograma local que começa no bloco `N n` do mesmo programa e termina no `M99`; `L` repete.
  - Zero de máquina no canto superior direito, com cursos negativos, como na máquina.
- **Dados a conferir:** o que os manuais não trazem (cursos, rotação máxima, magazine) está marcado como **nota** no JSON da máquina e aparece no painel da máquina.
- **Manuais:** ficam em `docs/manuals/`. Os PDFs são dos fabricantes e não estão no repositório.

## Alarmes do comando

Cada família de comando tem o seu catálogo de alarmes em `configs/alarms/`, e o JSON do comando aponta para ele com `"alarms"`. O catálogo da Fanuc 0i traz os alarmes de programa (P/S) do manual de manutenção, com o número e a mensagem da tela.
- **Verificação mapeada:** vira o alarme da máquina, como `PS0010 IMPROPER G-CODE`, e **para o programa naquele bloco**.
- **Na tela:** o programa mostra a linha do alarme em vermelho e uma faixa sobre a vista 3D.
- **Ciclos de torno:** `PS0061` sem P/Q, `PS0062` profundidade ou passes faltando, `PS0063` número de sequência não encontrado, `PS0064` perfil não monotônico em Z (G71 tipo I), `PS0065` sem G00/G01 no primeiro bloco do perfil. `PS0062`, `PS0064` e `PS0065` ainda precisam ser confirmados no manual de manutenção.
- **Chanfro e raio de canto (`,C` `,R`):** `PS0051` sem movimento depois, `PS0052` bloco seguinte não é G01/G02/G03, `PS0053` os dois no mesmo bloco, `PS0054` cone depois de canto sem vírgula, `PS0055` canto maior que um dos movimentos. Esses cinco números vêm da lista de alarmes da série 0i e ainda precisam ser confirmados no manual de manutenção.
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
