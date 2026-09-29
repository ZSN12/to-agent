/** DSH-style session/tool state indicator (aligned with ui-primitives StateDot). */
export type DshStateDotState = 'done' | 'warning' | 'ongoing' | 'error'

const MATRIX_CELLS: readonly (readonly [number, number])[] = [
  [0, 0], [4, 0], [8, 0], [8, 4], [8, 8], [4, 8], [0, 8], [0, 4],
]

export function DshStateDot({
  state,
  size = 10,
  className = '',
}: {
  state: DshStateDotState
  size?: number
  className?: string
}) {
  if (state === 'ongoing') {
    return (
      <svg
        className={`dsh-state-dot-matrix ${className}`.trim()}
        data-state="ongoing"
        width={size}
        height={size}
        viewBox="0 0 10 10"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {MATRIX_CELLS.map(([x, y], index) => (
          <rect
            key={`${x}-${y}`}
            className="dsh-state-dot-cell"
            x={x}
            y={y}
            width="2"
            height="2"
            style={{ animationDelay: `${(index - MATRIX_CELLS.length) * 125}ms` }}
          />
        ))}
      </svg>
    )
  }
  return (
    <span
      className={`dsh-state-dot ${className}`.trim()}
      data-state={state}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
