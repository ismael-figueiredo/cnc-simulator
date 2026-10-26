// Standard views of the 3D model as camera angles around the target, in the camera-controls sense:
// azimuth turns around the scene's up axis (Y) from +Z, polar is measured down from +Y.
// Mills draw machine Z up (scene Y); lathes draw the spindle axis as scene Z and X across.

/** Camera presets of the 3D model; "fit" only zooms to the part. */
export type ViewKind = 'iso' | 'top' | 'front' | 'side' | 'fit'

export interface ViewAngles {
  azimuth: number
  polar: number
}

const HALF = Math.PI / 2
/** Isometric: the three axes at the same angle to the screen. */
const ISO_POLAR = Math.acos(1 / Math.sqrt(3))

/**
 * Exact angles of a standard view, so Top and Front are really flat (no leftover tilt).
 * Mill top: machine X to the right and Y up. Lathe top: the drawing view, Z to the right and X up.
 */
export function viewAngles(kind: Exclude<ViewKind, 'fit'>, lathe: boolean): ViewAngles {
  if (kind === 'top') return { azimuth: lathe ? -HALF : 0, polar: 0 }
  if (kind === 'front') return { azimuth: 0, polar: HALF }
  if (kind === 'side') return { azimuth: HALF, polar: HALF }
  return { azimuth: Math.PI / 4, polar: ISO_POLAR }
}

/** Direction from the target to the camera for those angles (unit vector, scene coordinates). */
export function viewDirection({ azimuth, polar }: ViewAngles): [number, number, number] {
  return [Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)]
}
