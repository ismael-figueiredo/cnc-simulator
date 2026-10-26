export const D2R = Math.PI / 180
export const AXES = ['X', 'Y', 'Z', 'A', 'B', 'C'] as const
export type Axis = (typeof AXES)[number]
export type Position = Record<Axis, number>
export const isAxis = (s: string): s is Axis => (AXES as readonly string[]).includes(s)

/** A position with every axis given by `value`. */
export function positionOf(value: (axis: Axis) => number): Position {
  return { X: value('X'), Y: value('Y'), Z: value('Z'), A: value('A'), B: value('B'), C: value('C') }
}

/** The point a fraction f of the way from a to b, on every axis. */
export const lerpPosition = (a: Position, b: Position, f: number): Position => positionOf((ax) => a[ax] + (b[ax] - a[ax]) * f)
