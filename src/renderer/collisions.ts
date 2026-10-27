import { findChuckCollisions, findHolderCollisions, findTailstockCollisions, type ChuckCollision, type HolderCollision, type Machine, type Move, type Vec3 } from '@core/index'
import type { Setup } from './project'

export interface Collisions {
  /** Tool holder into the stock. */
  holder: HolderCollision[]
  /** Tool into the chuck or the tailstock center (lathes). */
  fixture: ChuckCollision[]
}

/** Every collision of the run against the setup. */
export function collisionsOf(moves: readonly Move[], setup: Setup, stockZero: Vec3, lathe: boolean, machine: Machine | undefined): Collisions {
  return {
    holder: findHolderCollisions({ moves, tools: setup.tools, stock: setup.stock, stockZero, lathe }),
    fixture: lathe
      ? [...findChuckCollisions(moves, setup.stock, stockZero, machine?.chuck), ...findTailstockCollisions(moves, setup.stock, stockZero, machine?.tailstock)]
      : []
  }
}

/** The holder collides on this move. */
export const holderHitAt = (c: Collisions, move: Move | undefined) => !!move && c.holder.some((x) => x.line === move.line && x.tool === move.state.tool)

/** The tool hits the chuck (or the tailstock) on this move. */
export const fixtureHitAt = (c: Collisions, move: Move | undefined, part: 'chuck' | 'tailstock') =>
  !!move && c.fixture.some((x) => (x.part ?? 'chuck') === part && x.line === move.line && x.tool === move.state.tool)
