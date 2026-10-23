// ANSI B29.1 sprocket tooth profile, sampled, to check the simulated tool path against.
// Same formulas as the O1500 program: chain pitch 12.7 mm, roller 7.9248 mm.
type P = [number, number]

export interface Sprocket {
  pitchRadius: number
  outsideRadius: number
  /** Dense samples of the whole gear outline. */
  outline: P[]
}

export function ansiSprocket(teeth: number, pitch = 12.7, roller = 7.9248): Sprocket {
  const s = (d: number) => Math.sin((d * Math.PI) / 180)
  const c = (d: number) => Math.cos((d * Math.PI) / 180)
  const N = teeth
  const Rp = pitch / (2 * s(180 / N))
  const Rs = (1.005 * roller + 0.003) / 2
  const A = 35 + 60 / N
  const B = 18 - 56 / N
  const E = 1.3025 * roller + 0.0015
  const F = roller * (0.8 * c(B) + 1.4 * c(17 - 64 / N) - 1.3025) - 0.0015
  const Ro = (pitch * (0.6 + c(180 / N) / s(180 / N))) / 2
  const Cx = Rp + 0.8 * roller * s(A)
  const Cy = -0.8 * roller * c(A)
  const Bx = Rp - 1.4 * roller * s(180 / N)
  const By = 1.4 * roller * c(180 / N)
  const P1: P = [Rp - Rs * s(A), Rs * c(A)]
  const P2: P = [Cx - E * s(A - B), Cy + E * c(A - B)]
  const P3: P = [Bx + F * s(A - B), By - F * c(A - B)]
  const d = Math.hypot(Bx, By)
  const aa = (Ro * Ro - F * F + d * d) / (2 * d)
  const h = Math.sqrt(Ro * Ro - aa * aa)
  const P4: P = [(aa * Bx + h * By) / d, (aa * By - h * Bx) / d]

  const half: P[] = []
  const arc = (cx: number, cy: number, r: number, p: P, q: P) => {
    const a0 = Math.atan2(p[1] - cy, p[0] - cx)
    let a1 = Math.atan2(q[1] - cy, q[0] - cx)
    if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI
    if (a0 - a1 > Math.PI) a1 += 2 * Math.PI
    for (let k = 0; k <= 200; k++) {
      const a = a0 + ((a1 - a0) * k) / 200
      half.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  arc(Rp, 0, Rs, [Rp - Rs, 0], P1)
  arc(Cx, Cy, E, P1, P2)
  for (let k = 0; k <= 50; k++) half.push([P2[0] + ((P3[0] - P2[0]) * k) / 50, P2[1] + ((P3[1] - P2[1]) * k) / 50])
  arc(Bx, By, F, P3, P4)
  const a4 = Math.atan2(P4[1], P4[0])
  for (let k = 0; k <= 100; k++) {
    const a = a4 + ((2 * Math.PI) / N - 2 * a4) * (k / 100)
    half.push([Ro * Math.cos(a), Ro * Math.sin(a)])
  }
  const gap = half.concat(half.map(([x, y]): P => [x, -y]))
  const outline: P[] = []
  for (let t = 0; t < N; t++) {
    const th = (t * 2 * Math.PI) / N
    for (const [x, y] of gap) outline.push([x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)])
  }
  return { pitchRadius: Rp, outsideRadius: Ro, outline }
}

const BUCKETS = 720
const bucketOf = (x: number, y: number) => {
  const a = Math.atan2(y, x)
  return Math.floor(((a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI)) * BUCKETS) % BUCKETS
}
const index = new WeakMap<P[], P[][]>()

/** Smallest distance from a point to the outline. Points are bucketed by angle so only nearby ones are compared. */
export function distanceToOutline(p: readonly [number, number, ...number[]], outline: P[]): number {
  let buckets = index.get(outline)
  if (!buckets) {
    buckets = Array.from({ length: BUCKETS }, () => [] as P[])
    for (const q of outline) buckets[bucketOf(q[0], q[1])]?.push(q)
    index.set(outline, buckets)
  }
  // a 14 mm neighborhood is enough: the tool is never farther than that from the profile it cuts
  const r = Math.max(1, Math.hypot(p[0], p[1]))
  const span = Math.min(BUCKETS / 2, Math.ceil((14 / r / (2 * Math.PI)) * BUCKETS) + 1)
  const b0 = bucketOf(p[0], p[1])
  let best = Infinity
  for (let k = -span; k <= span; k++) {
    for (const q of buckets[(b0 + k + BUCKETS) % BUCKETS] ?? []) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (d < best) best = d
    }
  }
  return best
}
