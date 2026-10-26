// Text rules of the program editor, kept apart from CodeMirror so they can be tested.

/**
 * Programs are written in capitals, as on the control's keyboard: letters typed or pasted become
 * upper case, except inside comments, which keep what was written. `open` says whether the text
 * starts inside a comment.
 */
export function upperOutsideComments(text: string, open: boolean): string {
  let inComment = open
  let out = ''
  for (const ch of text) {
    if (ch === '(') inComment = true
    else if (ch === ')' || ch === '\n') inComment = false
    out += inComment ? ch : ch.toUpperCase()
  }
  return out
}
