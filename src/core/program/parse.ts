import type { Control } from '../config/schema'

/** One executable line of the program, already stripped of comments, spaces and the block number. */
export interface Block {
  /** File line, starting at 0. */
  line: number
  /** Upper-case text without spaces or comments. Empty for a program-number marker. */
  text: string
  /** Sequence number (N), if any. */
  n: number | null
  /** Starts with "/" (skipped when block delete is on). */
  blockDelete: boolean
  /** Comment text found on the line, used for tool names and alarm messages. */
  comment: string
  /** Set on the marker block of "O1234" (or ":1234"). */
  programNumber?: number
}

/** How the file is laid out, for the control's load checks. */
export interface FileLayout {
  /** The first non-empty line is "%". */
  startPercent: boolean
  /** A "%" closes the record after the program. */
  endPercent: boolean
  /** Line of the closing "%", or the last line. */
  endLine: number
  /** Lines with a block but no ";" at the end. */
  missingEob: number[]
  /** Lines where "(" has no ")". */
  unclosedComments: number[]
  /** Line of the first block, or -1. */
  firstBlockLine: number
}

export interface ParsedProgram {
  blocks: Block[]
  /** Program number → index of its marker block. */
  programs: Map<number, number>
  layout: FileLayout
}

export function parseProgram(text: string, commentStyle: Control['dialect']['comment']): ParsedProgram {
  const blocks: Block[] = []
  const programs = new Map<number, number>()
  const lines = text.replace(/\r/g, '').split('\n')
  const layout: FileLayout = {
    startPercent: false,
    endPercent: false,
    endLine: Math.max(0, lines.length - 1),
    missingEob: [],
    unclosedComments: [],
    firstBlockLine: -1
  }
  let seenContent = false

  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line] ?? ''
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (/^%/.test(trimmed)) {
      // "%" is the end-of-record mark: the first one opens the file, the next one closes it
      if (!seenContent && !layout.startPercent) {
        layout.startPercent = true
        continue
      }
      layout.endPercent = true
      layout.endLine = line
      break
    }
    seenContent = true

    let comment = ''
    let t = raw
    if (commentStyle === 'parentheses') {
      if (/\([^)]*$/.test(t)) layout.unclosedComments.push(line)
      if (!/;\s*$/.test(t)) layout.missingEob.push(line)
      t = t.replace(/\([^)]*\)?/g, (m) => {
        comment += m.replace(/^\(|\)$/g, '') + ' '
        return ' '
      })
      t = t.replace(/;/g, ' ') // end-of-block mark
    } else {
      const i = t.indexOf(';')
      if (i >= 0) {
        comment = t.slice(i + 1)
        t = t.slice(0, i)
      }
    }
    t = t.trim().toUpperCase()
    comment = comment.trim()
    if (!t) continue
    if (layout.firstBlockLine < 0) layout.firstBlockLine = line

    let blockDelete = false
    if (t.startsWith('/')) {
      blockDelete = true
      t = t.slice(1).trim()
    }
    let m = /^[O:](\d+)\s*/.exec(t)
    if (m) {
      const num = Number(m[1])
      programs.set(num, blocks.length)
      blocks.push({ line, text: '', n: null, blockDelete: false, comment, programNumber: num })
      t = t.slice(m[0].length)
      if (!t) continue
    }
    let n: number | null = null
    m = /^N(\d+)\s*/.exec(t)
    if (m) {
      n = Number(m[1])
      t = t.slice(m[0].length)
    }
    blocks.push({ line, text: t.replace(/\s+/g, ''), n, blockDelete, comment })
  }
  return { blocks, programs, layout }
}
