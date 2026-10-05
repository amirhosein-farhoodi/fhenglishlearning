import type { Series, Visual } from '../../content/ielts-mock/types'

/**
 * Draws a Writing Task 1 visual the way the exam paper prints it: a titled chart with
 * labelled axes and a legend, a ruled table, a stage-by-stage diagram or a plan.
 * Everything is inline SVG/HTML from the task's data, so it stays sharp at any zoom
 * and in both themes (axes and text use currentColor).
 */

/** Series colours - distinct in hue AND in marker/dash, so they survive greyscale printing. */
const COLORS = ['#1f6f8b', '#c4710d', '#6d28d2', '#116b4a', '#c02b3f', '#596173', '#b8913a', '#4fa3c7']
const DASHES = ['', '6 4', '2 3', '10 3 2 3', '', '6 4', '2 3', '10 3 2 3']

function niceStep(range: number, target = 5) {
  const raw = range / target
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  const m = raw / pow
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10
  return nice * pow
}

function axis(values: number[]) {
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const step = niceStep(max - min || 1)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step || step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return { lo, hi, ticks }
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-GB') : String(n))

function Legend({ series, boxes }: { series: Series[]; boxes?: boolean }) {
  if (series.length < 2) return null
  return (
    <ul className="tv-legend">
      {series.map((s, i) => (
        <li key={s.name}>
          {boxes ? (
            <span className="tv-swatch" style={{ background: COLORS[i % COLORS.length] }} />
          ) : (
          <svg width="28" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="27" y2="5" stroke={COLORS[i % COLORS.length]} strokeWidth="2.5" strokeDasharray={DASHES[i % DASHES.length]} />
          </svg>
          )}
          {s.name}
        </li>
      ))}
    </ul>
  )
}

function Marker({ x, y, i }: { x: number; y: number; i: number }) {
  const c = COLORS[i % COLORS.length]
  switch (i % 4) {
    case 1:
      return <rect x={x - 3.5} y={y - 3.5} width="7" height="7" fill={c} />
    case 2:
      return <path d={`M${x} ${y - 4.5}L${x + 4.5} ${y + 3.5}H${x - 4.5}Z`} fill={c} />
    case 3:
      return <path d={`M${x} ${y - 4.5}L${x + 4.5} ${y}L${x} ${y + 4.5}L${x - 4.5} ${y}Z`} fill={c} />
    default:
      return <circle cx={x} cy={y} r="3.6" fill={c} />
  }
}

function LineChart({ v }: { v: Extract<Visual, { type: 'line' }> }) {
  const W = 600
  const H = 330
  const L = 62
  const R = 18
  const T = 16
  const B = 46
  const vals = v.series.flatMap((s) => s.values.filter((x): x is number => x !== null))
  const { lo, hi, ticks } = axis(vals)
  const x = (i: number) => L + (v.xLabels.length === 1 ? 0 : (i / (v.xLabels.length - 1)) * (W - L - R))
  const y = (val: number) => T + (1 - (val - lo) / (hi - lo)) * (H - T - B)
  return (
    <figure className="tv">
      <figcaption>{v.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.title}. Line graph.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="tv-grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="tv-tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        <line x1={L} x2={L} y1={T} y2={H - B} className="tv-axis" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="tv-axis" />
        {v.xLabels.map((l, i) => (
          <text key={l + i} x={x(i)} y={H - B + 18} textAnchor="middle" className="tv-tick">
            {l}
          </text>
        ))}
        <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="tv-label">
          {v.yLabel}
        </text>
        {v.series.map((s, si) => {
          const pts = s.values.map((val, i) => (val === null ? null : ([x(i), y(val)] as const)))
          let d = ''
          pts.forEach((p, i) => {
            if (!p) return
            d += `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`
          })
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth="2.4" strokeDasharray={DASHES[si % DASHES.length]} />
              {pts.map((p, i) => p && <Marker key={i} x={p[0]} y={p[1]} i={si} />)}
            </g>
          )
        })}
      </svg>
      <Legend series={v.series} />
    </figure>
  )
}

function BarChart({ v }: { v: Extract<Visual, { type: 'bar' }> }) {
  const vals = v.series.flatMap((s) => s.values.filter((x): x is number => x !== null))
  const { lo, hi, ticks } = axis(vals)
  const n = v.series.length
  if (v.horizontal) {
    const W = 600
    const L = 190
    const R = 24
    const T = 10
    const rowH = Math.max(26, 12 + n * 12)
    const H = T + v.categories.length * rowH + 44
    const x = (val: number) => L + ((val - lo) / (hi - lo)) * (W - L - R)
    const barH = Math.min(14, (rowH - 8) / n)
    return (
      <figure className="tv">
        <figcaption>{v.title}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.title}. Bar chart.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line y1={T} y2={H - 44} x1={x(t)} x2={x(t)} className="tv-grid" />
              <text x={x(t)} y={H - 44 + 16} textAnchor="middle" className="tv-tick">
                {fmt(t)}
              </text>
            </g>
          ))}
          <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="tv-label">
            {v.yLabel}
          </text>
          {v.categories.map((c, ci) => {
            const top = T + ci * rowH + (rowH - barH * n) / 2
            return (
              <g key={c}>
                <text x={L - 8} y={T + ci * rowH + rowH / 2 + 4} textAnchor="end" className="tv-tick">
                  {c}
                </text>
                {v.series.map((s, si) => {
                  const val = s.values[ci]
                  if (val === null) return null
                  return <rect key={s.name} x={x(Math.min(0, val))} y={top + si * barH} width={Math.abs(x(val) - x(0))} height={barH - 1.5} fill={COLORS[si % COLORS.length]} />
                })}
              </g>
            )
          })}
          <line x1={x(0)} x2={x(0)} y1={T} y2={H - 44} className="tv-axis" />
        </svg>
        <Legend series={v.series} boxes />
      </figure>
    )
  }
  const W = 600
  const H = 330
  const L = 62
  const R = 12
  const T = 16
  const B = 58
  const band = (W - L - R) / v.categories.length
  const barW = Math.min(34, (band * 0.76) / n)
  const y = (val: number) => T + (1 - (val - lo) / (hi - lo)) * (H - T - B)
  const longLabels = v.categories.some((c) => c.length > 11)
  return (
    <figure className="tv">
      <figcaption>{v.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.title}. Bar chart.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="tv-grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="tv-tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="tv-label">
          {v.yLabel}
        </text>
        {v.categories.map((c, ci) => {
          const cx = L + band * ci + band / 2
          const left = cx - (barW * n) / 2
          return (
            <g key={c}>
              {v.series.map((s, si) => {
                const val = s.values[ci]
                if (val === null) return null
                return <rect key={s.name} x={left + si * barW} y={y(Math.max(0, val))} width={barW - 2} height={Math.abs(y(val) - y(0))} fill={COLORS[si % COLORS.length]} />
              })}
              <text
                x={cx}
                y={H - B + 18}
                textAnchor={longLabels ? 'end' : 'middle'}
                transform={longLabels ? `rotate(-28 ${cx} ${H - B + 18})` : undefined}
                className="tv-tick"
              >
                {c}
              </text>
            </g>
          )
        })}
        <line x1={L} x2={L} y1={T} y2={H - B} className="tv-axis" />
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="tv-axis" />
      </svg>
      <Legend series={v.series} boxes />
    </figure>
  )
}

function PieChart({ v }: { v: Extract<Visual, { type: 'pie' }> }) {
  const R = 110
  const C = 125
  let angle = -Math.PI / 2
  const slices = v.slices.map((s, i) => {
    const a0 = angle
    const a1 = angle + (s.value / 100) * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (a: number, r = R) => [C + r * Math.cos(a), C + r * Math.sin(a)]
    const [x0, y0] = p(a0)
    const [x1, y1] = p(a1)
    const [lx, ly] = p((a0 + a1) / 2, R * 0.66)
    const d = s.value >= 99.99 ? `M${C} ${C - R}A${R} ${R} 0 1 1 ${C - 0.01} ${C - R}Z` : `M${C} ${C}L${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}Z`
    return { ...s, d, lx, ly, color: COLORS[i % COLORS.length] }
  })
  return (
    <figure className="tv tv-pie">
      <figcaption>{v.title}</figcaption>
      <div className="tv-pie-body">
        <svg viewBox="0 0 250 250" role="img" aria-label={`${v.title}. Pie chart.`}>
          {slices.map((s) => (
            <path key={s.label} d={s.d} fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />
          ))}
          {slices.map(
            (s) =>
              s.value >= 6 && (
                <text key={s.label} x={s.lx} y={s.ly + 4} textAnchor="middle" className="tv-pie-pct">
                  {s.value}%
                </text>
              ),
          )}
        </svg>
        <ul className="tv-legend tv-legend-col">
          {slices.map((s) => (
            <li key={s.label}>
              <span className="tv-swatch" style={{ background: s.color }} />
              {s.label} <b>{s.value}%</b>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}

function TableVisual({ v }: { v: Extract<Visual, { type: 'table' }> }) {
  return (
    <figure className="tv">
      <figcaption>{v.title}</figcaption>
      <div className="tv-table-wrap">
        <table className="tv-table">
          <thead>
            <tr>
              {v.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (ci === 0 ? <th key={ci}>{c}</th> : <td key={ci}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function ProcessVisual({ v }: { v: Extract<Visual, { type: 'process' }> }) {
  return (
    <figure className="tv">
      <figcaption>{v.title}</figcaption>
      <ol className={`tv-process${v.cycle ? ' is-cycle' : ''}`}>
        {v.steps.map((s, i) => (
          <li key={i}>
            <span className="tv-stage">Stage {i + 1}</span>
            <b>{s.label}</b>
            {s.detail && <span className="tv-detail">{s.detail}</span>}
          </li>
        ))}
      </ol>
      {v.cycle && <p className="tv-cycle-note">↻ After stage {v.steps.length} the cycle returns to stage 1.</p>}
    </figure>
  )
}

const MAP_FILL: Record<string, string> = {
  building: 'var(--tv-building)',
  green: 'var(--tv-green)',
  water: 'var(--tv-water)',
  road: 'var(--tv-road)',
}

function wrap(label: string, max: number): string[] {
  const words = label.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur)
      cur = w
    } else cur = cur ? `${cur} ${w}` : w
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 3)
}

function MapVisual({ v }: { v: Extract<Visual, { type: 'map' }> }) {
  const U = 30
  const S = 12 * U
  // Roads first so buildings and labels sit on top of them.
  const order = [...v.features].sort((a, b) => (a.kind === 'road' ? -1 : 0) - (b.kind === 'road' ? -1 : 0))
  return (
    <figure className="tv tv-map">
      <figcaption>{v.title}</figcaption>
      <svg viewBox={`-4 -4 ${S + 8} ${S + 8}`} role="img" aria-label={`${v.title}. Map.`}>
        <rect x="0" y="0" width={S} height={S} className="tv-map-ground" />
        {order.map((f, i) => (
          <rect key={i} x={f.x * U} y={f.y * U} width={f.w * U} height={f.h * U} fill={MAP_FILL[f.kind ?? 'building']} className={`tv-map-${f.kind ?? 'building'}`} rx={f.kind === 'green' || f.kind === 'water' ? 10 : 2} />
        ))}
        {order.map((f, i) => {
          const maxChars = Math.max(6, Math.floor((f.w * U) / 6.6))
          const lines = wrap(f.label, maxChars)
          const cx = (f.x + f.w / 2) * U
          const cy = (f.y + f.h / 2) * U - ((lines.length - 1) * 12) / 2
          const vertical = f.kind === 'road' && f.h > f.w * 2
          return (
            <text key={`t${i}`} x={cx} y={cy + 4} textAnchor="middle" className="tv-map-label" transform={vertical ? `rotate(-90 ${cx} ${(f.y + f.h / 2) * U})` : undefined}>
              {(vertical ? [f.label] : lines).map((l, li) => (
                <tspan key={li} x={cx} dy={li === 0 ? 0 : 12}>
                  {l}
                </tspan>
              ))}
            </text>
          )
        })}
        <g transform={`translate(${S - 22} 22)`} className="tv-compass">
          <path d="M0 -14L6 6L0 2L-6 6Z" />
          <text y="-17" textAnchor="middle">
            N
          </text>
        </g>
      </svg>
    </figure>
  )
}

export default function TaskVisual({ visual }: { visual: Visual }) {
  switch (visual.type) {
    case 'line':
      return <LineChart v={visual} />
    case 'bar':
      return <BarChart v={visual} />
    case 'pie':
      return <PieChart v={visual} />
    case 'table':
      return <TableVisual v={visual} />
    case 'process':
      return <ProcessVisual v={visual} />
    case 'map':
      return <MapVisual v={visual} />
  }
}
