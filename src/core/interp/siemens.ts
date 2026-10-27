// Siemens SINUMERIK 840D blocks in the interpreter's own terms. Most of the language maps onto what
// the interpreter already runs: R parameters become variables (#500 + n), "X=R1+2" an expression
// word, CR= the arc radius, RND/CHR/CHF the direct corner words, U/V/W the IC() increments. What
// has no counterpart comes back apart: jumps, subprogram calls, cycles, T and D, and the words the
// simulator does not draw.

/** R0 … R99 live in the common variables from here (#500 = R0). */
export const R_BASE = 500

export interface SiemensCycle {
  name: string
  /** Each argument as an interpreter expression, a quoted string as it is, or null when left empty. */
  args: (string | null)[]
}

export interface SiemensBlock {
  /** Label at the start of the block ("START:"), without its colon. */
  label: string | null
  /** R parameter assignments, as "#501=…" statements, in the order written. */
  assigns: string[]
  /** GOTOF / GOTOB / GOTO, with its condition (IF … GOTOF) as an interpreter expression. */
  jump: { target: string; condition: string | null } | null
  /** L n P m: subprogram n, m times. */
  call: { program: number; repeat: number } | null
  cycle: SiemensCycle | null
  /** MCALL with a cycle: repeat it at every position after; MCALL alone: stop that. */
  modalCall: 'set' | 'cancel' | null
  /** T and D words: the simulator turns them into its own tool and offset selection. */
  tool: number | null
  edge: number | null
  /** The block's NC words, as the interpreter reads them. */
  nc: string
  /** Words and functions not simulated (frames, splines, other cycles…). */
  notSimulated: string[]
}

/** Interpolations and frames that move nothing here, or move in a way the simulator does not draw. */
const FRAMES = new Set(['TRANS', 'ATRANS', 'ROT', 'AROT', 'SCALE', 'ASCALE', 'MIRROR', 'AMIRROR', 'TOFRAME'])
/** Keywords with no effect on the drawn path. */
const IGNORED = new Set(['DIAMON', 'DIAM90', 'NORM', 'KONT', 'CFC', 'CFTCP', 'CFIN', 'STOPRE', 'STARTFIFO', 'STOPFIFO', 'BNAT', 'ENAT', 'BTAN', 'ETAN', 'BAUTO', 'EAUTO'])
/** Cycles the simulator draws; others are reported as not simulated. */
export const SIMULATED_CYCLES = new Set(['CYCLE81', 'CYCLE82', 'CYCLE83', 'CYCLE95'])
const CYCLE_NAME = /^(CYCLE\d+|HOLES\d|POCKET\d|SLOT\d|LONGHOLE)$/
const INCREMENTAL: Record<string, string> = { X: 'U', Y: 'V', Z: 'W' }
const FUNCTIONS: Record<string, string> = { ATAN2: 'ATAN', TRUNC: 'FIX', SIN: 'SIN', COS: 'COS', TAN: 'TAN', ASIN: 'ASIN', ACOS: 'ACOS', SQRT: 'SQRT', ABS: 'ABS', ROUND: 'ROUND', LN: 'LN', EXP: 'EXP' }

/** A Siemens expression in the interpreter's syntax: R n → #(500 + n), ( ) → [ ], == <> >= <= > < → EQ NE GE LE GT LT. */
export function siemensExpression(e: string): string {
  let s = e.replace(/\s+/g, '').toUpperCase()
  // POT(x) is x squared
  s = s.replace(/POT\(/g, 'POW(').replace(/POW\(([^()]*)\)/g, 'POW($1,2)')
  s = s.replace(/\bR(\d+)/g, (_, n: string) => `#${R_BASE + Number(n)}`)
  s = s.replace(/([A-Z][A-Z0-9]*)\(/g, (_, name: string) => `${FUNCTIONS[name] ?? name}[`)
  s = s.replace(/\(/g, '[').replace(/\)/g, ']')
  return s.replace(/==/g, 'EQ').replace(/<>/g, 'NE').replace(/>=/g, 'GE').replace(/<=/g, 'LE').replace(/>/g, 'GT').replace(/</g, 'LT')
}

/** Splits at the commas that are not inside parentheses or quotes. */
function splitArgs(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let cur = ''
  for (const c of s) {
    if (c === '"') quoted = !quoted
    if (!quoted && c === '(') depth++
    if (!quoted && c === ')') depth--
    if (!quoted && depth === 0 && c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** One block (upper case, comment already removed), read into its parts. */
export function readSiemensBlock(raw: string): SiemensBlock {
  const block: SiemensBlock = { label: null, assigns: [], jump: null, call: null, cycle: null, modalCall: null, tool: null, edge: null, nc: '', notSimulated: [] }
  let text = raw.trim()
  const label = /^([A-Z_][A-Z0-9_]*):(?!=)\s*/.exec(text)
  if (label?.[1]) {
    block.label = label[1]
    text = text.slice(label[0].length)
  }
  // Strings stay as they are (MSG texts, contour names); spaces around operators go, so each word is one token
  const strings: string[] = []
  text = text.replace(/"[^"]*"/g, (q) => `"${strings.push(q) - 1}"`)
  text = text
    .replace(/\s*([=+\-*/,<>])\s*/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    // "CYCLE81 (…)" as the manual writes it
    .replace(/([A-Z0-9])\s+\(/g, '$1(')
  const unquote = (s: string) => s.replace(/"(\d+)"/g, (_, k: string) => strings[Number(k)] ?? '')
  const tokens = text.split(/\s+/).filter(Boolean)
  const nc: string[] = []
  let dwell = false
  let thread = false
  let frame = false
  let repeat = 1

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k] as string
    const assign = /^R(\d+)=(.+)$/.exec(t)
    if (assign?.[1] && assign[2]) {
      block.assigns.push(`#${R_BASE + Number(assign[1])}=${siemensExpression(assign[2])}`)
      continue
    }
    if (t === 'IF') {
      const at = tokens.findIndex((x, i) => i > k && /^GOTO[FB]?$/.test(x))
      if (at < 0) {
        block.notSimulated.push('IF')
        break
      }
      block.jump = { target: tokens[at + 1] ?? '', condition: siemensExpression(tokens.slice(k + 1, at).join('')) }
      k = at + 1
      continue
    }
    if (/^GOTO[FB]?$/.test(t)) {
      block.jump = { target: tokens[k + 1] ?? '', condition: null }
      k++
      continue
    }
    if (t === 'MCALL') {
      block.modalCall = 'cancel'
      continue
    }
    const call = /^([A-Z][A-Z0-9]*)\((.*)\)$/.exec(t)
    if (call?.[1] !== undefined && CYCLE_NAME.test(call[1])) {
      const args = splitArgs(call[2] ?? '').map((a) => unquote(a).trim())
      block.cycle = { name: call[1], args: args.map((a) => (a === '' ? null : a.startsWith('"') ? a : siemensExpression(a))) }
      if (block.modalCall === 'cancel') block.modalCall = 'set'
      continue
    }
    if (/^MSG\(/.test(t)) continue
    const sub = /^L(\d+)$/.exec(t)
    if (sub?.[1]) {
      block.call = { program: Number(sub[1]), repeat: 1 }
      continue
    }
    const key = /^([A-Z]+)=(.+)$/.exec(t)
    if (key?.[1] && key[2]) {
      const [, name, value] = key
      const ac = /^AC\((.*)\)$/.exec(value)
      const ic = /^IC\((.*)\)$/.exec(value)
      if (name === 'CR') nc.push(`R[${siemensExpression(value)}]`)
      else if (name === 'RND') nc.push(`,R[${siemensExpression(value)}]`)
      else if (name === 'CHR') nc.push(`,C[${siemensExpression(value)}]`)
      else if (name === 'CHF') nc.push(`,F[${siemensExpression(value)}]`)
      else if (name === 'LIMS') continue
      else if (name === 'T') block.tool = Number(value) || 0
      else if (name === 'D') block.edge = Number(value) || 0
      else if (name.length === 1 && ic?.[1] !== undefined) {
        const inc = INCREMENTAL[name]
        if (inc) nc.push(`${inc}[${siemensExpression(ic[1])}]`)
        else block.notSimulated.push(`${name}=IC`)
      } else if (name.length === 1) nc.push(`${name}[${siemensExpression(ac?.[1] ?? value)}]`)
      else block.notSimulated.push(`${name}=`)
      continue
    }
    // Plain words, written apart or run together: G1 X10 Z-5 or G1X10Z-5
    if (/^([A-Z]-?[\d.]+)+$/.test(t)) {
      for (const [, letter, value] of t.matchAll(/([A-Z])(-?[\d.]+)/g)) {
        if (letter === 'T') block.tool = Number(value)
        else if (letter === 'D') block.edge = Number(value)
        else if (letter === 'P' && block.call) repeat = Number(value)
        else {
          if (letter === 'G' && Number(value) === 4) dwell = true
          if (letter === 'G' && Number(value) === 33) thread = true
          nc.push(`${letter}${value}`)
        }
      }
      continue
    }
    if (t === 'RET') {
      nc.push('M17')
      continue
    }
    if (IGNORED.has(t)) continue
    if (FRAMES.has(t)) frame = true
    block.notSimulated.push(t)
  }
  if (block.call) block.call.repeat = repeat
  // G4: the dwell is F seconds (or S revolutions); G33: the lead is K (along Z) or I (across)
  let words = nc
  if (dwell) words = words.map((w) => w.replace(/^[FS](?=[\d.[])/, 'X'))
  if (thread) words = words.map((w) => w.replace(/^[KI](?=[\d.[])/, 'F'))
  // A frame's axis words set the frame, they are not a move
  if (frame) words = words.filter((w) => !/^[XYZABCUVW]/.test(w))
  block.nc = words.join('')
  return block
}
