# Contributing · Como contribuir

[Português](#português) · [English](#english)

## English

CNC Simulator is free and made for the community: students, programmers and teachers. Help is welcome in any of these ways.

### Report a problem
- From the app: **Help → Report a problem** fills in the version and system and takes a screenshot.
- Wrong alarm or wrong path: say which **machine and control** were selected and paste the blocks around the problem. If the program is confidential, paste only those blocks.
- If you have the control's manual, the page with the alarm or code helps a lot. Do not attach the manual itself: it belongs to its maker.

### Ask for a machine or a control
Open a **Machine or control request** issue with the maker, model, control, travels, maximum spindle speed and tool magazine, from the machine plate or catalog.

### Add a machine or a control yourself
Machines, controls, alarms and tools are JSON files in [`configs/`](configs), checked against the schemas in [`src/core/config/schema.ts`](src/core/config/schema.ts). The README section **Config files** explains each one.
1. **Machine:** copy the closest file in `configs/machines/` (for example `romi-gl300.json` for a lathe, `haas-vf2.json` for a machining center), change the id, name, axes and spindles, and put anything you could not confirm in `notes`.
2. **Control:** copy the closest file in `configs/controls/`. Every G and M code maps to a `function` the interpreter knows; codes it does not draw yet can use `not-simulated` or `other`.
3. **Alarms:** map simulator checks to the control's alarm numbers in `configs/alarms/`. Mark numbers not confirmed in a manual as such in the README.
4. **Test:** add a short test in `tests/` (see `tests/haas.test.ts`) and, if you can, an example in `examples/` with its `.cncsim` project.
5. Run `npm run check` (types, lint and tests) and open a pull request.

### Write an exercise
Exercises are JSON files in [`examples/learn/`](examples/learn): a title and statement in the three languages, the machine, control and stock, a starting program and a solution. **Check** compares the student's part with the one the solution makes, so any program that makes the same part passes. Add it to `tests/exercises.test.ts` so the solution is checked to run without alarms.

### Code
- `npm install`, then `npm run dev` to run the app. See **For developers** in the README.
- Small commits, in English, in the [Conventional Commits](https://www.conventionalcommits.org) style (`feat(core): …`, `fix(ui): …`, `docs: …`).
- User-facing texts go in the three languages in `src/i18n/` (Portuguese, English and Spanish).
- Never commit control manuals, customer programs or post-processors.

### License
Contributions are released under the [GPL-3.0-or-later](LICENSE) license of the project.

## Português

O CNC Simulator é gratuito e feito para a comunidade: alunos, programadores e professores. Toda ajuda é bem-vinda.

### Relatar um problema
- Pelo app: **Ajuda → Relatar um problema** já preenche a versão e o sistema e tira um print da tela.
- Alarme ou percurso errado: diga a **máquina e o comando** escolhidos e cole os blocos perto do problema. Se o programa for confidencial, cole só esses blocos.
- Se você tem o manual do comando, a página com o alarme ou o código ajuda muito. Não anexe o manual: ele é do fabricante.

### Pedir uma máquina ou um comando
Abra uma issue **Pedido de máquina ou comando** com fabricante, modelo, comando, cursos, rotação máxima e magazine, tirados da placa da máquina ou do catálogo.

### Adicionar uma máquina ou um comando
Máquinas, comandos, alarmes e ferramentas são arquivos JSON em [`configs/`](configs), conferidos pelos esquemas em [`src/core/config/schema.ts`](src/core/config/schema.ts). A seção **Config files** do README em inglês explica cada um.
1. **Máquina:** copie o arquivo mais parecido em `configs/machines/` (por exemplo `romi-gl300.json` para torno, `haas-vf2.json` para centro de usinagem), troque id, nome, eixos e fusos, e coloque em `notes` o que não deu para confirmar.
2. **Comando:** copie o mais parecido em `configs/controls/`. Cada código G e M aponta para uma `function` que o interpretador conhece; os que ele ainda não desenha podem usar `not-simulated` ou `other`.
3. **Alarmes:** ligue as verificações do simulador aos números de alarme do comando em `configs/alarms/`. Números não confirmados em manual ficam marcados no README.
4. **Teste:** acrescente um teste curto em `tests/` (veja `tests/haas.test.ts`) e, se puder, um exemplo em `examples/` com o projeto `.cncsim`.
5. Rode `npm run check` (tipos, lint e testes) e abra um pull request.

### Escrever um exercício
Exercícios são arquivos JSON em [`examples/learn/`](examples/learn): título e enunciado nos três idiomas, máquina, comando e blank, um programa inicial e uma solução. O **Conferir** compara a peça do aluno com a que a solução faz, então qualquer programa que faça a mesma peça passa. Acrescente-o em `tests/exercises.test.ts` para a solução ser conferida sem alarmes.

### Código
- `npm install` e depois `npm run dev` para rodar o app. Veja **Para desenvolvedores** no README.
- Commits pequenos, em inglês, no estilo [Conventional Commits](https://www.conventionalcommits.org) (`feat(core): …`, `fix(ui): …`, `docs: …`).
- Textos da tela vão nos três idiomas em `src/i18n/` (português, inglês e espanhol).
- Nunca envie manuais de comando, programas de clientes ou pós-processadores.

### Licença
As contribuições seguem a licença [GPL-3.0-or-later](LICENSE) do projeto.
