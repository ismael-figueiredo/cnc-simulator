import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { ViewKind } from '../views'

export interface DisplayOptions {
  rapids: boolean
  stock: boolean
  machining: boolean
  /** Lathe only: chuck and part turn in C while the tool stays in X/Z. */
  machineView: boolean
  /** The stock as the whole program leaves it, wherever playback is. */
  finished: boolean
}

interface Props {
  lathe: boolean
  onView: (kind: ViewKind) => void
  display: DisplayOptions
  onDisplay: (change: Partial<DisplayOptions>) => void
  ortho: boolean
  onOrtho: (on: boolean) => void
  follow: boolean
  onFollow: (on: boolean) => void
  measuring: boolean
  onMeasure: () => void
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
// Simple line icons: fit, cube views, eye, projection, follow target, ruler
const ICONS = {
  fit: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M7 7h6v6H7z',
  iso: 'M10 2.5 17 6.5v7L10 17.5 3 13.5v-7Zm0 0v15M3 6.5l7 4 7-4',
  top: 'M4 4h12v12H4zM4 4l12 12M16 4 4 16',
  front: 'M4 6h12v10H4zM4 6l3-3h12l-3 3M19 3v10l-3 3',
  side: 'M6 4h10v12H6zM6 4 3 7v12l3-3M3 19h10',
  eye: 'M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Zm8 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  persp: 'M3 4h14l-3 12H6Z',
  ortho: 'M4 4h12v12H4z',
  follow: 'M10 2v4M10 14v4M2 10h4M14 10h4M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  measure: 'M2.5 13.5 13.5 2.5l4 4-11 11ZM6 10l1.5 1.5M8.5 7.5 10 9M11 5l1.5 1.5'
}

/** A button that opens a small menu under it, closed by any click outside. */
function Menu({ icon, label, children }: { icon: string; label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="vt-menu" ref={box}>
      <button className={open ? 'on' : ''} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon d={icon} />
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="dropdown" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Heads-up toolbar over the 3D model, as in CAD programs: fit, standard views, what is shown, projection, follow and measure. */
export function ViewToolbar({ lathe, onView, display, onDisplay, ortho, onOrtho, follow, onFollow, measuring, onMeasure }: Props) {
  const { t } = useI18n()
  const views: { kind: ViewKind; label: string; icon: string }[] = [
    { kind: 'iso', label: t('view.iso'), icon: ICONS.iso },
    { kind: 'top', label: t('view.top'), icon: ICONS.top },
    { kind: 'front', label: t('view.front'), icon: ICONS.front },
    { kind: 'side', label: t('view.side'), icon: ICONS.side }
  ]
  const layers: { key: keyof DisplayOptions; label: string; hint?: string }[] = [
    { key: 'rapids', label: t('layers.rapids') },
    { key: 'stock', label: t('layers.stock') },
    { key: 'machining', label: t('layers.machining'), hint: t('layers.machiningHint') },
    { key: 'finished', label: t('layers.finished'), hint: t('layers.finishedHint') },
    ...(lathe ? [{ key: 'machineView' as const, label: t('layers.machineView'), hint: t('layers.machineViewHint') }] : [])
  ]
  return (
    <div className="view-toolbar" role="toolbar" aria-label={t('view.toolbar')} title={t('view.hint')}>
      <button title={t('view.fitHint')} aria-label={t('view.fit')} onClick={() => onView('fit')}>
        <Icon d={ICONS.fit} />
      </button>
      <Menu icon={ICONS.iso} label={t('view.viewHint')}>
        {(close) =>
          views.map((v) => (
            <button
              key={v.kind}
              role="menuitem"
              onClick={() => {
                close()
                onView(v.kind)
              }}
            >
              <Icon d={v.icon} /> {v.label}
            </button>
          ))
        }
      </Menu>
      <Menu icon={ICONS.eye} label={t('view.display')}>
        {() =>
          layers.map((x) => (
            <label key={x.key} className="check" title={x.hint}>
              <input type="checkbox" checked={display[x.key]} onChange={(e) => onDisplay({ [x.key]: e.target.checked })} />
              {x.label}
            </label>
          ))
        }
      </Menu>
      <span className="sep" />
      <button className={ortho ? 'on' : ''} aria-pressed={ortho} title={t(ortho ? 'view.orthoHint' : 'view.perspHint')} aria-label={t('view.projection')} onClick={() => onOrtho(!ortho)}>
        <Icon d={ortho ? ICONS.ortho : ICONS.persp} />
      </button>
      <button className={follow ? 'on' : ''} aria-pressed={follow} title={t('view.followHint')} aria-label={t('view.follow')} onClick={() => onFollow(!follow)}>
        <Icon d={ICONS.follow} />
      </button>
      <button className={measuring ? 'on' : ''} aria-pressed={measuring} title={t('view.measureHint')} aria-label={t('view.measure')} onClick={onMeasure}>
        <Icon d={ICONS.measure} />
      </button>
    </div>
  )
}
