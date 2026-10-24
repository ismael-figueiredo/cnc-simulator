# Changelog

Cada versão em português e inglês. · Each version in Portuguese and English.

Downloads: https://github.com/ismael-figueiredo/cnc-simulator/releases

## 0.9.0 · 2026-10-24

### Português
**Painel de operação e tela como a da máquina.**
- **BLOCO A BLOCO:** para no fim de cada bloco; Executar segue para o próximo.
- **M01** (parada opcional) liga e desliga; o **M00** sempre para.
- **SALTO DE BLOCO /** pula os blocos que começam com "/".
- **Override de avanço** (10–150 %) e **de rápido** (F0, 25, 50, 100 %): o tempo de ciclo e a execução acompanham.
- **Ponto de parada:** clique no número da linha para parar antes daquele bloco.
- **Quadro de modais acima do programa:** códigos G ativos, F, S, T e o ciclo fixo, como na tela PROGRAM CHECK da Fanuc.

### English
**Operator panel and a machine-like screen.**
- **SINGLE BLOCK:** stops at the end of each block; Run goes on to the next one.
- **M01** (optional stop) on and off; **M00** always stops.
- **BLOCK DELETE /** skips the blocks that start with "/".
- **Feed override** (10–150 %) and **rapid override** (F0, 25, 50, 100 %): the cycle time and playback follow them.
- **Breakpoints:** click a line number to stop before that block.
- **Modal area above the program:** active G codes, F, S, T and the canned cycle, as on the Fanuc PROGRAM CHECK screen.

## 0.8.0 · 2026-10-24

### Português
**Corretores de ferramenta.**
- **Tabela de corretores** (tela OFFSET) no projeto, preenchida pelas ferramentas: comprimento e raio no centro de usinagem; X/Z, raio e direção de ponta no torno; geometria e desgaste.
- **G43 H:** a posição de máquina passa a ser a da linha de referência do fuso, e o sobrecurso é conferido com ela. Um H errado (de outra ferramenta, ou zerado) desenha a ponta onde ela vai de verdade e avisa a diferença; cortar sem G43 também avisa.
- **G41/G42 com D** (centro de usinagem) e **compensação do raio da ponta no torno**, com desgaste.
- **Torno:** o desgaste X/Z desloca a ponta; a geometria entra na posição de máquina.
- **G10** L10–L13 (centro) e G10 P n / P 10000+n (torno) gravam corretores durante a execução.
- **Correção:** G28/G53 com G43 ativo davam um falso sobrecurso.

### English
**Tool offsets.**
- **Offset table** (OFFSET screen) in the project, filled from the tools: length and radius on machining centers; X/Z, nose radius and tip direction on lathes; geometry and wear.
- **G43 H:** machine position is the spindle gauge line, and travel is checked with it. A wrong H (another tool's, or empty) draws the tip where it really goes and warns of the difference; cutting without G43 warns too.
- **G41/G42 with D** (machining centers) and **lathe nose radius compensation**, wear included.
- **Lathes:** X/Z wear moves the tip; geometry goes into the machine position.
- **G10** L10–L13 (machining centers) and G10 P n / P 10000+n (lathes) write offsets as the program runs.
- **Fix:** G28/G53 with G43 active gave a false overtravel.

## 0.7.0 · 2026-10-24

### Português
**Ciclos de torno.** Antes esses blocos davam aviso de "não simulado" e o movimento era pulado.
- **G71/G72** (desbaste), **G73** (repetição de perfil) e **G70** (acabamento) a partir do perfil entre P e Q, com a sobra U/W. O perfil é lido como o comando lê, inclusive com `,C`/`,R` e arcos, e os blocos dele depois do G71 só rodam no G70.
- **Ciclos simples** G90/G94/G92 (sistema A) e G77/G79/G78 (sistema B), modais e com cone R.
- **Roscas:** G76 em várias passadas (profundidade d·√n, passes de acabamento) e G32/G33; o tempo segue o passo × rotação.
- A barra é usinada passe a passe na visão de usinagem.
- **Alarmes Fanuc** PS0062, PS0064 e PS0065 (a confirmar no manual).
- **Exemplo novo:** eixo roscado com G71/G70 e rosca M20 × 2,5 em G76 no Romi GL 300, e ferramenta de rosca na biblioteca de torno.

### English
**Lathe canned cycles.** Before, these blocks were reported as not simulated and their moves skipped.
- **G71/G72** (roughing), **G73** (pattern repeating) and **G70** (finishing) from the shape between P and Q, with the U/W allowance. The shape is read as the control reads it, ,C/,R and arcs included, and its blocks after G71 only run in G70.
- **Single cycles** G90/G94/G92 (system A) and G77/G79/G78 (system B), modal, with the R cone.
- **Threads:** G76 in several passes (depth d·√n, finishing passes) and G32/G33; time follows lead × spindle speed.
- The bar is cut pass by pass in the machining view.
- **Fanuc alarms** PS0062, PS0064 and PS0065 (to confirm in the manual).
- **New example:** threaded shaft with G71/G70 and an M20 × 2.5 G76 thread on the Romi GL 300, and a threading tool in the lathe library.

## 0.6.1 · 2026-10-23

### Português
**Desempenho em programas longos.** Com um programa CAM de 10 mil linhas: abrir caiu de 952 para 110 ms, a execução foi de 20 para 30 quadros por segundo sem engasgos, e RESET/FIM ficaram instantâneos.
- A tela do programa desenha só as linhas visíveis.
- A simulação roda numa thread separada: a janela não trava ao abrir ou editar (aparece "Simulando…").
- O blank usinado atualiza só a região que a ferramenta tocou.
- Correção: na 0.6.0 a visão de usinagem refazia o programa inteiro a cada quadro.
- Voltar no tempo retoma a usinagem do ponto salvo mais próximo; mensagens e percurso pesam menos.

### English
**Performance on long programs.** With a 10,000-line CAM program: opening went from 952 to 110 ms, playback from 20 to 30 frames per second without stutter, and RESET/END are instant.
- The program screen draws only the lines on screen.
- Simulation runs in a separate thread: the window does not freeze when opening or editing ("Simulating…" shows meanwhile).
- The machined stock updates only the region the tool touched.
- Fix: in 0.6.0 the machining view replayed the whole program on every frame.
- Seeking back resumes the cut stock from the nearest checkpoint; messages and toolpath are lighter.

## 0.6.0 · 2026-10-23

### Português
- **Visão de usinagem:** o blank muda de cor e de forma onde a ferramenta corta (fresamento em bloco, torneamento em barra).
- **Placa redesenhada** na posição certa, com aviso quando a ferramenta pode bater nas castanhas ou no corpo.
- **Blank:** "Gerar pelo programa" e zero peça num canto ou no centro do bloco.
- **Salvar:** disquete salva o programa (.nc); o botão do projeto diz .cncsim.
- **Exemplo novo:** eixo escalonado no Romi GL 300 e biblioteca de ferramentas de torneamento.
- **Correção:** torno não recebe mais ferramentas de centro de usinagem ao criar um programa.

### English
- **Machining view:** the stock changes color and shape where the tool cuts (milling on blocks, turning on bars).
- **Chuck redrawn** in the right place, with a warning when the tool may hit the jaws or body.
- **Stock:** "Fit to program" and work zero on a corner or the center of the block.
- **Saving:** the disk icon saves the program (.nc); the project button says .cncsim.
- **New example:** stepped shaft on the Romi GL 300 and a lathe turning tool library.
- **Fix:** lathes no longer get machining center tools when creating a program.

## 0.5.0 · 2026-10-23

### Português
- **Chanfro e raio de canto automáticos** `,C` e `,R` em qualquer ângulo, seguidos pela compensação de raio, com os alarmes Fanuc PS0051–PS0055. Opção de `C`/`R` sem vírgula no torno.
- **EDIT** para a execução, e o percurso, as mensagens e os alarmes acompanham o texto enquanto você digita.

### English
- **Automatic chamfer and corner R** `,C` and `,R` at any angle, followed by cutter compensation, with Fanuc alarms PS0051–PS0055. Lathe option for `C`/`R` without comma.
- **EDIT** stops a running program, and the path, messages and alarms follow the text as you type.

## 0.4.0 · 2026-10-23

### Português
- **Novo programa** pergunta se é G-code comum ou **parametrizado (Macro B)** e já escreve o cabeçalho com os códigos do comando escolhido.
- **Correção:** variáveis de posição `#5001`… seguem a ordem de eixos da máquina (no centro de usinagem `#5002` é Y).
- README com a seção de programação parametrizada.

### English
- **New program** asks for plain G-code or **parametric (Macro B)** and writes a header in the selected control's own codes.
- **Fix:** position variables `#5001`… follow the machine's axis order (on a mill `#5002` is Y).
- README section on parametric programming.

## 0.3.0 · 2026-10-23

### Português
- **Ferramentas em 3D** com cone ou suporte, e aviso de colisão do suporte com o blank.
- **Torno:** placa e visão da máquina (a peça gira em C, a ferramenta fica em X/Z).
- **Ferramentas:** montagem axial/radial, externa/interna, direita/esquerda, inserto ISO; hélice e inserto desenhados no editor.
- **Exemplos de centro de usinagem** (Romi D600) e biblioteca BT40.
- Programa abre em **RESET**; clicar num bloco começa dali; saiu o botão Simular.

### English
- **3D tools** with their taper or holder, and holder-stock collision warnings.
- **Lathe:** chuck and machine view (the part turns in C, the tool stays in X/Z).
- **Tools:** axial/radial mount, external/internal, right/left hand, ISO insert; helix and insert drawings in the editor.
- **Machining center examples** (Romi D600) and a BT40 library.
- Programs open at **RESET**; clicking a block starts from it; the Simulate button is gone.

## 0.2.0 · 2026-10-23

### Português
- **Tela de programa estilo Fanuc** e **tela inicial** com abertos recentemente e o exemplo.
- **Editor EDIT/MEM**, novo, salvar e salvar como.
- **Projetos .cncsim** com máquina, comando, ferramentas, blank e zeros.
- **Editores** de ferramentas (bibliotecas reutilizáveis) e de blank com cor.
- **Zeros de peça** G54–G59 e G54.1 P, G10 L2/L20, G53, posição absoluta e de máquina, aviso de fim de curso.

### English
- **Fanuc-style program screen** and a **start screen** with recent files and the example.
- **EDIT/MEM editor**, new, save and save as.
- **.cncsim projects** with machine, control, tools, stock and work offsets.
- **Editors** for tools (reusable libraries) and stock with color.
- **Work offsets** G54–G59 and G54.1 P, G10 L2/L20, G53, absolute and machine position, travel warnings.

## 0.1.2 · 2026-10-23

### Português
- **Ajuda → Relatar um problema:** print da janela e issue no GitHub já preenchida.
- **Atualização automática** no Windows e no AppImage; aviso com link no macOS e no .deb.
- **Telas de instalação:** imagens do instalador do Windows, página da licença e janela do .dmg.

### English
- **Help → Report a problem:** window screenshot and a prefilled GitHub issue.
- **Automatic updates** on Windows and AppImage; a notice with a link on macOS and .deb.
- **Installer screens:** Windows installer artwork, license page and the .dmg window.

## 0.1.1 · 2026-10-23

### Português
- Logo do app no instalador, no Dock/Barra de Tarefas e na janela.

### English
- App logo on the installer, the Dock/taskbar and the window.

## 0.1.0 · 2026-10-23

### Português
Primeira versão.
- Interpretador de G-code com Macro B, G12.1 e compensação G41/G42, guiado por máquina e comando em JSON (Romi GL, Romi D, Mitsubishi M80, genéricos).
- Alarmes do próprio comando param o programa no bloco, como na máquina.
- Percurso em 3D com execução, painel de posição e mensagens em pt-BR, inglês e espanhol.
- Instaladores para Windows, macOS e Linux.

### English
First release.
- G-code interpreter with Macro B, G12.1 and G41/G42 compensation, driven by machine and control JSON files (Romi GL, Romi D, Mitsubishi M80, generic).
- The control's own alarms stop the program at the block, as on the machine.
- 3D toolpath with playback, position panel and messages in Portuguese, English and Spanish.
- Installers for Windows, macOS and Linux.
