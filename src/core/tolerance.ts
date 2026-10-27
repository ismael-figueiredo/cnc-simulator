// Length tolerances shared by the interpreter and the geometry checks (mm).

/** Shorter than this is no length at all: a move that does not move, two points that are one. */
export const NO_LENGTH = 1e-9

/** Positions closer than this are the same for limits, collisions and shape checks. */
export const SAME_POSITION = 1e-6
