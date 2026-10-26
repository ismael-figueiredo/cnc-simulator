// Distinct, readable on the dark screens and on the light panel
const PALETTE = ['#5ea4f2', '#3fd19c', '#f0b43a', '#c792ea', '#f06b50', '#4fd1e0', '#e0d24f', '#f28fb8', '#9bd65e', '#b0a4f2']

/** Color of a tool on the timeline and in the operation list (the same tool keeps its color). */
export const toolColor = (tool: number) => (tool > 0 ? (PALETTE[(tool - 1) % PALETTE.length] ?? '#8d99a3') : '#8d99a3')
