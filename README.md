# CNC Simulator

[Português (Brasil)](README.pt-BR.md) · English

Lightweight, cross-platform CNC program simulator. It reads G-code, takes the **machine** and the **control** from JSON files (a post-processor in reverse) and shows the toolpath and the machined part in 3D.

It grew out of `Simulador_Fanuc.html` ([docs/legacy](docs/legacy/Simulador_Fanuc.html)), a single-file simulator that already handles Fanuc Macro B, G12.1 and G41/G42 cutter compensation on a Romi GL lathe with live tooling. This project rewrites it in TypeScript, split into core, UI and desktop app, and is no longer tied to one control.

> **Status: 0.3.**
> - **Simulation:** the interpreter runs any program against the selected machine and control and shows the toolpath in 3D, with playback, a position panel and translated diagnostics.
> - **Fanuc alarms:** program errors stop the run at the block with the control's own alarm number, as on the machine.
> - **Next:** material removal, user configs and the machine setup.

## Requirements

- Node.js 22.12 or newer
- Windows 10/11. Linux and macOS use the same code but are not tested yet.

## Getting started

```bash
npm install                          # dependencies
node node_modules/electron/install.js  # Electron binary (since Electron 45 it is not fetched by npm install)
npm run dev          # desktop app with hot reload
npm run check        # types + lint + tests: run before every commit
npm test             # tests only (Vitest)
npm run typecheck    # types only
npm run lint         # lint only (ESLint, zero warnings allowed); lint:fix fixes what it can
npm run build        # check, then build to out/ (build:only skips the check)
npm run server       # browser mode at http://localhost:5174 (run npm run build first)
npm run dist:win     # Windows installer in dist/
```

### Troubleshooting

- **`npm run dev` fails with `Cannot read properties of undefined (reading 'handle')` and "Node.js" in the trace:** the environment has `ELECTRON_RUN_AS_NODE=1`, which some VS Code extensions set. Electron then runs as plain Node. Clear it first:
  - PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`
  - Git Bash: `unset ELECTRON_RUN_AS_NODE`

## Quality checks

`npm run check` must pass with no errors and no warnings. `npm run build` (and therefore `dist:win`) runs it first and stops on any failure.

- **Types:** `tsc` in strict mode with `noUncheckedIndexedAccess`.
  - TypeScript stays on **6.0** because typescript-eslint does not support the native TypeScript 7 yet.
- **Lint:** ESLint 10 with `typescript-eslint` **strict type-checked** rules, React hooks rules (React Compiler aware) and `eqeqeq`.
  - Callbacks in interfaces are written as properties (`onSeek: (t: number) => void`).
- **Tests:** Vitest.
  - The O1500 sprocket with 9/15/20 teeth: the Ø6 cutter center must stay exactly 3.000 mm from the ANSI profile, and the Ø8 relief holes must leave stock.
  - The Romi manual G42 example.
  - Rule violations, Macro B and a mill program.
  - Every diagnostic and UI text exists in every language.
- **VS Code:** `.vscode/` recommends the ESLint extension and fixes on save.

## Languages

The code base, config files and docs are in English. The UI is translated, with **Portuguese (Brazil)** as the default, plus English and Spanish.

- **Catalogs:** `src/i18n/locales/` holds one catalog per language. `en.ts` is the source; the compiler rejects any other catalog that misses or adds a key, and a test checks that every `{placeholder}` is kept.
- **Adding a language:**
  1. Copy `pt-BR.ts`.
  2. Translate it.
  3. Add it to `LANGUAGES` in `src/i18n/index.ts`.
- **Picking the language:**
  - **Desktop:** the native menu **Settings → Language**. The renderer stores the choice. Every native menu item is translated; built-in Electron role menus are not used because their items stay in English.
  - **Browser mode:** a selector in the header, since there is no menu bar.
- **Config validation messages:** use zod's own locales.
- **Config files:** any user-facing text (`name`, `description`) can be a plain string or one string per language:
  ```json
  "name": { "en": "Live tool", "pt-BR": "Ferramenta acionada", "es": "Herramienta motorizada" }
  ```
  Missing languages fall back to English.
- **Core diagnostics:** the interpreter will report a `code` plus `params`, never a sentence, so each language words them its own way.

## Stack

| Part | Technology | Why |
|---|---|---|
| Core (`src/core`) | Plain TypeScript | Runs the same in the app, the server and the tests |
| i18n (`src/i18n`) | Plain TypeScript, typed catalogs | Shared by UI, main process and server; no dependency |
| UI (`src/renderer`) | React + TSX, three.js via @react-three/fiber and drei | Declarative 3D view in TSX |
| Desktop (`src/main`, `src/preload`) | Electron + electron-vite | One code base for Windows, Linux and macOS |
| Configs | JSON validated with zod | Readable errors; TS types come from the schemas |
| HTTP (optional) | Fastify | Browser mode and simulation API |
| Installer | electron-builder | NSIS (Windows, multi-language), AppImage, dmg |
| Tests | Vitest | |

## Layout

```
src/
  core/            no DOM: types, schemas and (phase 1) the interpreter
    config/        schema.ts (zod) and load.ts (validation, issues as data)
  i18n/            languages, translate(), localize(); locales/en.ts is the source
  main/            Electron main process: window, menus, files
  preload/         safe typed bridge between window and system (api.ts)
  renderer/        React UI (App.tsx, i18n.tsx, components/)
  server/          Fastify server (browser mode)
configs/
  machines/        one machine per file: axes, spindles, turret, stock
  controls/        one control per file: dialect, G and M codes, rules
  tools/           tool libraries and holders (tapers)
examples/          sample programs (O1500, ANSI 40 sprocket)
tests/             Vitest tests
docs/legacy/       original HTML simulator, reference for the port
```

## Machines and controls included

| Machine | Control file | Source |
|---|---|---|
| Romi GL 250 M (C axis, live tool) | `fanuc-0i-tf-system-b` | Romi manual GL 250/300/350/450 T/M/Y |
| Romi GL 300 (no C axis) | `fanuc-0i-tf-system-b` | same manual, version T; G12.1, C words and S2= raise PS0010/PS0009 |
| Romi D600 | `fanuc-0i-mf-romi-d` | Romi manual PA09403B (Fanuc 0i-MF Plus) |
| Romi D1000, D1250 | `fanuc-0i-mf-romi-d` | Romi manual U57998C (D800/D1000/D1250, Fanuc 0i-MF) |
| Mitsubishi M80 lathe (generic) | `mitsubishi-m80-lathe-list3` or `-list2` | Mitsubishi programming manual IB-1501370 (lathe system) |
| Mitsubishi M80 machining center (generic) | `mitsubishi-m80-mc` | Mitsubishi programming manual IB-1501372 (machining center system) |
| Generic 3-axis machining center | `fanuc-0i-mf` | — |

- **Data to check on the machine plate:** each machine file has `notes` for anything the manuals do not give, such as travels, maximum speed and magazine size. The app shows these notes in the machine panel.
- **Manuals:** they are kept in `docs/manuals/`, by maker.
- **Mitsubishi lathe G-code lists:** the lathe has six lists, selected by parameter `#1037 cmdtyp`.
  - **List 2** works like Fanuc system A: G98/G99 feed, G90/G92/G94 simple cycles, G190/G191 absolute and incremental.
  - **List 3** works like Fanuc system B: G94/G95 feed, G77/G78/G79 simple cycles, G90/G91.
- **Mitsubishi decimal point and integer addresses:**
  - The files assume decimal point type I (`#1078 Decpt2 = 0`), so `X1` is 0.001 mm.
  - A decimal point on an integer address (D, H, L, M, N, O, P, S, T) is dropped, not an alarm. This is the `integerAddressDecimal: "ignore"` option; Fanuc raises PS0007.
- **Functions the controls accept but the simulator does not draw yet:** G68 rotation, G51.1 mirror, G52 local coordinates, G15/G16 polar coordinates, G12/G13 circle cutting, G10. They raise a warning, because the path after them would be wrong.

## Config files

Three separate files you can mix: the same machine with another control, or one tool library on several machines. Schemas live in [src/core/config/schema.ts](src/core/config/schema.ts).

**Machine:** inspired by the LinuxCNC INI.
```json
{
  "id": "romi-gl250-m", "name": "Romi GL 250 M", "type": "mill-turn", "kinematics": "lathe-xzc",
  "axes": [
    { "name": "X", "type": "linear", "min": -2, "max": 400, "rapid": 30000, "diameter": true },
    { "name": "C", "type": "rotary", "min": -99999, "max": 99999, "rapid": 18000 }
  ],
  "spindles": [{ "id": "S2", "name": { "en": "Live tool", "pt-BR": "Ferramenta acionada" }, "type": "live", "maxRpm": 4500 }],
  "toolChangePosition": { "X": 300, "Z": 200 },
  "defaultControl": "fanuc-0i-tf-system-b"
}
```

**Control:** the "post-processor". Inspired by FreeCAD posts and Fusion `.cps` files. Every G or M code maps to a **function** the interpreter knows (`rapid`, `polar-on`, `cutter-comp-left`, `c-axis-on`, `brake-on`…), so a new control is just a new JSON file.
```json
{
  "id": "fanuc-0i-tf-system-b", "family": "fanuc", "machineType": "lathe",
  "dialect": { "gCodeSystem": "B", "decimalPoint": "calculator", "xDiameter": true, "macro": "fanuc-b",
               "comment": "parentheses", "liveToolSpeedAddress": "S2=" },
  "gCodes": { "G12.1": { "function": "polar-on" }, "G94": { "function": "feed-per-minute" } },
  "mCodes": { "M19": { "function": "c-axis-on" }, "M85": { "function": "brake-on" } },
  "rules": ["no-g0-in-polar", "no-brake-in-polar"]
}
```

**Control alarms:** each control family has its own alarm catalog in `configs/alarms/`, and the control names it with `"alarms"`.
- **Catalog contents:** the alarm numbers and screen messages as the control shows them, plus a `map` from simulator checks to those numbers. For Fanuc 0i, these are the P/S program errors from the maintenance manual.
- **Mapped checks:** they become the machine's alarm (for example `PS0010 IMPROPER G-CODE`) and **stop the program at that block**, like the machine.
- **Unmapped checks:** they stay as warnings.
- **Fanuc 0i catalog:**
  - **Format:** `PS0001` invalid character, `PS0003` too many digits, `PS0004`/`PS0005` address, `PS0006` sign, `PS0007` decimal point, `PS0009` axis not on the machine, `PS0010` undefined G code.
  - **Motion:** `PS0011` no feed, `PS0020`–`PS0023` arcs, `PS0030` offset number.
  - **Cutter compensation:** `PS0033`/`PS0034`/`PS0037`/`PS0041` G41/G42 (start on an arc, plane change, blocks without movement, interference).
  - **Cycles:** `PS0045` G83 without Q, `PS0061`/`PS0063` G70–G73.
  - **Program numbers and subprograms:** `PS0074`–`PS0078`.
  - **Macro:** `PS0110`–`PS0129` and `PS0199` (division by zero, variables, brackets, DO/END, GOTO, G65), plus `#3000` → `PS3000+n`.
  - **Polar interpolation:** `PS0145`/`PS0146` G12.1.
  - **End of record and decimal point:** `PS5010` end of record, `PS5073` decimal point.
- **Mitsubishi M800/M80 catalog:** `P32`–`P39` format, `P62` feed, `P70`/`P113` arcs, `P112`/`P151`–`P157` cutter compensation, `P170` offset number, `P230`–`P232` subprograms, `P241`/`P243` variables, `P481`/`P485` polar interpolation.
  - **Confirmed numbers:** all of these are cited in the programming manuals.
  - **To confirm:** `P36`, `P277` (#3000 message) and the macro family `P280`–`P294` come from Mitsubishi's standard list and should be confirmed in the alarm manual.

**File format and limits** are part of the control, like its parameters:
```json
"fileFormat": { "startPercent": true, "endPercent": true, "eob": "semicolon", "missingEob": "alarm",
                "programNumber": "required", "requireDecimalPoint": false },
"limits": { "maxDigits": 8, "maxValue": 99999.999, "subprogramNesting": 4, "bracketNesting": 5,
            "loopIds": 3, "maxProgramNumber": 9999, "compNoMoveBlocks": 1, "arcTolerance": 0.02, "toolOffsets": 64 }
```
- **Load checks:** `%` at the start and end, the `;` end of block, and the program number are checked when the file is loaded. They are reported, and the program still runs.
- **End of record:** reaching the closing `%` without M30/M02/M99 raises the end-of-record alarm.

**Tools and holders:** inspired by the CAMotics tool table. Holders (BT40, HSK63A, VDI, BMT…) carry a revolution profile `[radius, length]` for the 3D drawing.

## Roadmap

1. ✅ **Core:** legacy simulator ported to `src/core`.
   - program reader and Macro B expressions;
   - interpreter driven by the control JSON;
   - G12.1 and G41/G42 compensation (polar plane and mill XY);
   - drilling cycles.
2. ◐ **Toolpath:**
   - Done: 3D path with done/remaining parts, tool marker, playback, click-to-block, translated diagnostics, position panel.
   - Next: 2D face and side views and a fit-to-path camera.
3. **Machines and controls:** load the user's JSON; profiles for Fanuc T (A/B), Fanuc M, Haas and LinuxCNC; later Siemens and Mazak.
4. **Tools:** library, holders and tapers, with 3D tool drawing.
5. **Machined part in 3D:** material removal (heightmap/dexel for facing and milling, solid of revolution for turning).
6. **Desktop:** open and save, auto-reload when the `.nc` changes, file associations, installer.
7. **Server:** `/api/simulate` API and use from a browser on the shop network.
8. **Importers and collision:** read FreeCAD posts and Fusion `.cps`; tool and holder collision with part, chuck and turret.
