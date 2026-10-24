import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createHeightfield, createProfile, cutHeightfield, cutProfile, type Exercise, type Move, type Vec3 } from '@core/index'
import { useI18n } from '../i18n'

/** Outcome of "Check": did it run, and how far is the part from the solution's. */
export interface ExerciseCheck {
  finished: boolean
  alarms: number
  left: number
  leftAt: Vec3 | null
  gouge: number
  gougeAt: Vec3 | null
  ok: boolean
}

interface Props {
  exercise: Exercise
  /** The solution's moves, for the drawing of the finished part. */
  reference: readonly Move[]
  lathe: boolean
  zero: Vec3
  check: ExerciseCheck | null
  onCheck: () => void
  onClose: () => void
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString()

/** Half section of the turned part, as on a drawing: chuck side on the left, face on the right, diameters on each step. */
function TurnedDrawing({ exercise, reference, zero }: { exercise: Exercise; reference: readonly Move[]; zero: Vec3 }) {
  const shape = useMemo(() => {
    const p = createProfile(exercise.stock, zero)
    for (const m of reference) cutProfile(p, m)
    return p
  }, [exercise, reference, zero])
  const W = 280
  const H = 120
  const len = shape.radii.length * shape.cell
  const sx = (W - 20) / len
  const sy = (H / 2 - 12) / shape.radius
  const s = Math.min(sx, sy)
  const x = (i: number) => W - 10 - i * shape.cell * s
  const y = (r: number) => H / 2 - r * s
  const top = [...shape.radii].map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(' ')
  const bottom = [...shape.radii].map((r, i) => `${x(i).toFixed(1)},${(H - y(r)).toFixed(1)}`).reverse().join(' ')
  // One label per step at least 2 mm long
  const steps: { r: number; from: number; to: number }[] = []
  shape.radii.forEach((r, i) => {
    const last = steps[steps.length - 1]
    if (last && Math.abs(last.r - r) < 0.01) last.to = i
    else steps.push({ r, from: i, to: i })
  })
  const labels = steps.filter((st) => (st.to - st.from) * shape.cell >= 2 && st.r < shape.radius - 0.01)
  return (
    <svg className="ex-drawing" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="drawing">
      <rect x={x(shape.radii.length - 1)} y={y(shape.radius)} width={len * s} height={shape.radius * 2 * s} className="stock" />
      <polygon points={`${top} ${bottom}`} className="part" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="axis" />
      {labels.map((st) => (
        <text key={st.from} x={(x(st.from) + x(st.to)) / 2} y={y(st.r) - 3} textAnchor="middle">
          Ø{f1(st.r * 2)}
        </text>
      ))}
    </svg>
  )
}

/** Top view of the milled part: deeper is darker, the raw stock is the light frame. */
function MilledDrawing({ exercise, reference, zero }: { exercise: Exercise; reference: readonly Move[]; zero: Vec3 }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const field = useMemo(() => {
    const h = createHeightfield(exercise.stock, zero)
    for (const m of reference) cutHeightfield(h, m, false)
    return h
  }, [exercise, reference, zero])
  useEffect(() => {
    const c = canvas.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    c.width = field.nx
    c.height = field.ny
    const img = g.createImageData(field.nx, field.ny)
    const depth = Math.max(0.001, field.top - field.bottom)
    for (let j = 0; j < field.ny; j++)
      for (let i = 0; i < field.nx; i++) {
        const d = (field.top - (field.heights[j * field.nx + i] ?? field.top)) / depth
        // Image rows go down, Y goes up
        const k = ((field.ny - 1 - j) * field.nx + i) * 4
        const v = Math.round(215 - 170 * Math.min(1, d * 1.6))
        img.data[k] = d > 0.001 ? v * 0.55 : 200
        img.data[k + 1] = d > 0.001 ? v * 0.8 : 165
        img.data[k + 2] = d > 0.001 ? v : 74
        img.data[k + 3] = 255
      }
    g.putImageData(img, 0, 0)
  }, [field])
  return <canvas ref={canvas} className="ex-drawing" style={{ aspectRatio: `${field.nx} / ${field.ny}` }} />
}

/** The exercise over the 3D view: what to make, a drawing of the finished part, and the check. */
export const ExerciseCard = memo(function ExerciseCard({ exercise, reference, lathe, zero, check, onCheck, onClose }: Props) {
  const { t, l } = useI18n()
  const [open, setOpen] = useState(true)
  const [solution, setSolution] = useState(false)
  const where = (p: Vec3 | null) => (!p ? '' : lathe ? ` · Z${f1(p[2])}` : ` · X${f1(p[0])} Y${f1(p[1])}`)
  return (
    <aside className={`exercise ${open ? '' : 'closed'}`}>
      <header>
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'} {l(exercise.title)}
        </button>
        <span className="tag">{t('exercise.level', { level: exercise.level })}</span>
        <button className="btn tiny" title={t('exercise.close')} aria-label={t('exercise.close')} onClick={onClose}>×</button>
      </header>
      {open && (
        <div className="ex-body">
          <p className="statement">{l(exercise.statement)}</p>
          {lathe ? <TurnedDrawing exercise={exercise} reference={reference} zero={zero} /> : <MilledDrawing exercise={exercise} reference={reference} zero={zero} />}
          <div className="row">
            <button className="btn primary" onClick={onCheck}>{t('exercise.check')}</button>
            <button className={`btn ${solution ? 'on' : ''}`} onClick={() => setSolution(!solution)}>{t(solution ? 'exercise.hideSolution' : 'exercise.showSolution')}</button>
          </div>
          {check && (
            <ul className={`ex-result ${check.ok ? 'ok' : 'bad'}`}>
              {check.ok && <li>{t('exercise.ok')}</li>}
              {!check.finished && <li>{t('exercise.notFinished')}</li>}
              {check.alarms > 0 && <li>{t('exercise.alarms', { count: check.alarms })}</li>}
              {check.left > exercise.tolerance && <li>{t(lathe ? 'exercise.leftLathe' : 'exercise.left', { mm: f1(check.left) }) + where(check.leftAt)}</li>}
              {check.gouge > exercise.tolerance && <li>{t(lathe ? 'exercise.gougeLathe' : 'exercise.gouge', { mm: f1(check.gouge) }) + where(check.gougeAt)}</li>}
            </ul>
          )}
          {solution && <pre className="ex-solution">{exercise.solution}</pre>}
        </div>
      )}
    </aside>
  )
})
