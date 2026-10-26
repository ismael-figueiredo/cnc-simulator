import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { HELP_TOKEN } from '../help'
import { upperOutsideComments } from '../editing'

export interface EditorHandle {
  getText: () => string
  /** MDI keys: type at the cursor, CAN erases the character before it, DELETE the block (line). */
  insert: (text: string) => void
  backspace: () => void
  deleteLine: () => void
  /** Text of the line up to the cursor (to know whether a new word needs a space). */
  textBeforeCursor: () => string
}

/** Whether position `pos` of the document is inside a comment, on its own line. */
function inCommentAt(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos)
  const before = line.text.slice(0, pos - line.from)
  return before.lastIndexOf('(') > before.lastIndexOf(')')
}

interface Props {
  text: string
  fontSize: number
  /** Called once per edit; the text itself is read with getText() when needed. */
  onEdit: () => void
  ref?: Ref<EditorHandle>
  /** Learning mode: help for the G/M code, variable or macro word under the mouse. */
  help?: (word: string) => string | undefined
}

const MACRO_WORDS = /^(WHILE|IF|GOTO|THEN|DO|END|EQ|NE|GT|LT|GE|LE|AND|OR|XOR|MOD|SIN|COS|TAN|ATAN|SQRT|ABS|ROUND|FIX|FUP)\b/i

// G-code words for highlighting only; the interpreter has its own parser in src/core/program.
const gcode = StreamLanguage.define({
  name: 'gcode',
  token(stream: StringStream) {
    if (stream.eatSpace()) return null
    if (stream.match(/^\(.*?(\)|$)/)) return 'comment'
    if (stream.match(/^[;%]/)) return 'meta'
    if (stream.match(/^#\d+/) || stream.match(/^#\[/)) return 'variableName.special'
    if (stream.match(MACRO_WORDS)) return 'controlKeyword'
    if (stream.match(/^[GM]\s*-?[\d.]+/i)) return stream.current().toUpperCase().startsWith('G') ? 'keyword' : 'atom'
    if (stream.match(/^[NO:]\s*\d+/i)) return 'labelName'
    if (stream.match(/^[FSTHDPQL]\s*[-+]?[\d.]*/i)) return 'number'
    if (stream.match(/^[XYZUVWABCIJKRE]/i)) return 'propertyName'
    if (stream.match(/^[-+]?(\d+\.?\d*|\.\d+)/)) return 'number'
    stream.next()
    return null
  }
})

// Same palette as the MEM screen (.cnc-screen in styles.css)
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#6fd3ff' },
  { tag: tags.atom, color: '#ffb547' },
  { tag: tags.propertyName, color: '#e4ebef', fontWeight: '600' },
  { tag: tags.number, color: '#9fe39f' },
  { tag: tags.labelName, color: '#8a98a3' },
  { tag: tags.comment, color: '#7f8c96', fontStyle: 'italic' },
  { tag: tags.meta, color: '#56636d' },
  { tag: tags.special(tags.variableName), color: '#d6a2ff' },
  { tag: tags.controlKeyword, color: '#ff8fb1', fontWeight: '600' }
])

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: '#05080a', color: '#e4ebef' },
    '.cm-scroller': { fontFamily: "'Share Tech Mono', var(--f-mono)", lineHeight: '1.45' },
    '.cm-content': { caretColor: '#f2c418' },
    '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid #f2c418' },
    '.cm-gutters': { backgroundColor: '#05080a', color: '#46525c', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(242, 196, 24, .10)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#f2c418' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(111, 211, 255, .25)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(255, 255, 255, .08)' },
    '.cm-panels': { backgroundColor: '#13324f', color: '#d6e6f5' },
    '.cm-searchMatch': { backgroundColor: 'rgba(242, 196, 24, .35)' },
    '.cm-help': { maxWidth: '420px', padding: '6px 9px', backgroundColor: '#13324f', color: '#e4ebef', border: '1px solid #6fd3ff', fontFamily: 'var(--f-ui)', fontSize: '12.5px', lineHeight: '1.4' }
  },
  { dark: true }
)

/** EDIT mode: the program as an editable text, styled like the control's edit screen. */
export function ProgramEditor({ text, fontSize, onEdit, ref, help }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onEditRef = useRef(onEdit)
  useEffect(() => {
    onEditRef.current = onEdit
  }, [onEdit])
  // The editor is built once; the help it shows follows the control and language through this ref
  const helpRef = useRef(help)
  useEffect(() => {
    helpRef.current = help
  }, [help])

  useImperativeHandle(
    ref,
    () => ({
      getText: () => view.current?.state.doc.toString() ?? text,
      insert: (s: string) => {
        const v = view.current
        if (!v) return
        v.dispatch(v.state.replaceSelection(s))
        v.focus()
      },
      backspace: () => {
        const v = view.current
        if (!v) return
        const { from, to } = v.state.selection.main
        if (from === to && from > 0) v.dispatch({ changes: { from: from - 1, to: from } })
        else if (from !== to) v.dispatch(v.state.replaceSelection(''))
        v.focus()
      },
      textBeforeCursor: () => {
        const v = view.current
        if (!v) return ''
        const head = v.state.selection.main.head
        const line = v.state.doc.lineAt(head)
        return line.text.slice(0, head - line.from)
      },
      deleteLine: () => {
        const v = view.current
        if (!v) return
        const line = v.state.doc.lineAt(v.state.selection.main.head)
        v.dispatch({ changes: { from: line.from, to: Math.min(v.state.doc.length, line.to + 1) } })
        v.focus()
      }
    }),
    [text]
  )

  // Created once per program (the parent remounts it with a new key); edits stay inside CodeMirror
  useEffect(() => {
    if (!box.current) return
    const v = new EditorView({
      parent: box.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          search({ top: true }),
          highlightSelectionMatches(),
          gcode,
          syntaxHighlighting(highlight),
          // Typed and pasted letters become capitals (comments keep their case)
          EditorView.inputHandler.of((v, from, to, typed) => {
            const upper = upperOutsideComments(typed, inCommentAt(v.state, from))
            if (upper === typed) return false
            v.dispatch({ changes: { from, to, insert: upper }, selection: { anchor: from + upper.length }, userEvent: 'input.type' })
            return true
          }),
          EditorView.clipboardInputFilter.of((pasted, state) => upperOutsideComments(pasted, inCommentAt(state, state.selection.main.from))),
          hoverTooltip((v, pos) => {
            const help = helpRef.current
            if (!help) return null
            const line = v.state.doc.lineAt(pos)
            const code = line.text.split('(')[0] ?? ''
            for (const m of code.matchAll(HELP_TOKEN)) {
              const from = line.from + m.index
              const to = from + m[0].length
              if (pos < from || pos > to) continue
              const tip = help(m[0])
              if (!tip) return null
              return {
                pos: from,
                end: to,
                above: true,
                create: () => {
                  const dom = document.createElement('div')
                  dom.className = 'cm-help'
                  dom.textContent = `${m[0].toUpperCase().replace(/\s+/g, '')} — ${tip}`
                  return { dom }
                }
              }
            }
            return null
          }),
          theme,
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onEditRef.current()
          })
        ]
      })
    })
    view.current = v
    v.focus()
    return () => {
      v.destroy()
      view.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the initial text only; later text lives in the editor
  }, [])

  return <div className="cnc-editor" ref={box} style={{ fontSize }} />
}
