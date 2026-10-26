// Where GOTO, WHILE/END and the cycles' P/Q land in the program's blocks.
import type { Block } from '../program/parse'

/** Index of the block with sequence number N n, or -1. */
export const findSequence = (blocks: readonly Block[], n: number) => blocks.findIndex((b) => b.n === n)

/** The END id that closes the WHILE … DO id at block i, or -1. */
export function findLoopEnd(blocks: readonly Block[], i: number, id: string): number {
  for (let k = i + 1; k < blocks.length; k++) if (blocks[k]?.text === 'END' + id) return k
  return -1
}

/** The WHILE … DO id (or bare DO id) that the END id at block i goes back to, or -1. */
export function findLoopStart(blocks: readonly Block[], i: number, id: string): number {
  for (let k = i - 1; k >= 0; k--) {
    const t = blocks[k]?.text ?? ''
    if (/^(WHILE|DO)/.test(t) && t.endsWith('DO' + id)) return k
  }
  return -1
}

/** A block of NC words (not a program number, a macro statement or a loop mark). */
export const isNcBlock = (b: Block | undefined): b is Block => !!b?.text && b.programNumber === undefined && !/^(#|IF|WHILE|GOTO|DO\d|END\d)/.test(b.text)

/** The block uses macro syntax (variables or IF / WHILE / GOTO / DO / END). */
export const usesMacro = (text: string) => text.includes('#') || /^(IF|WHILE|GOTO|DO\d|END\d)/.test(text)
