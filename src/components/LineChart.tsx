// Minimal SVG line chart: 2px lines, recessive grid, single y-axis,
// legend for multiple series, crosshair tooltip on hover.
import { useMemo, useRef, useState } from 'react';

export interface Series {
  label: string;
  color: string;
  xs: number[];
  ys: number[];
}

interface Props {
  series: Series[];
  height?: number;
  yFormat?: (v: number) => string;
  title?: string;
}

function fmtDefault(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${Math.round(v * 10) / 10}`;
}

export function LineChart({ series, height = 150, yFormat = fmtDefault, title }: Props): JSX.Element {
  const width = 320;
  const pad = { l: 42, r: 8, t: 8, b: 20 };
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const { paths, xMin, xMax, gridYs } = useMemo(() => {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMax = 1;
    for (const s of series) {
      for (let i = 0; i < s.xs.length; i++) {
        if (s.xs[i] < xMin) xMin = s.xs[i];
        if (s.xs[i] > xMax) xMax = s.xs[i];
        if (s.ys[i] > yMax) yMax = s.ys[i];
      }
    }
    if (!Number.isFinite(xMin)) {
      xMin = 0;
      xMax = 1;
    }
    if (xMax === xMin) xMax = xMin + 1;
    yMax *= 1.08;
    const sx = (x: number): number => pad.l + ((x - xMin) / (xMax - xMin)) * (width - pad.l - pad.r);
    const sy = (y: number): number => pad.t + (1 - y / yMax) * (height - pad.t - pad.b);
    const paths = series.map((s) => {
      let d = '';
      for (let i = 0; i < s.xs.length; i++) {
        d += `${i === 0 ? 'M' : 'L'}${sx(s.xs[i]).toFixed(1)},${sy(s.ys[i]).toFixed(1)}`;
      }
      return d;
    });
    const gridYs = [0.25, 0.5, 0.75, 1].map((f) => ({ y: sy(yMax * f * (1 / 1.08)), v: yMax * f * (1 / 1.08) }));
    return { paths, xMin, xMax, yMax, gridYs };
  }, [series, height]);

  const hover = useMemo(() => {
    if (hoverX === null || series.length === 0) return null;
    const dataX = xMin + ((hoverX - pad.l) / (width - pad.l - pad.r)) * (xMax - xMin);
    const vals = series
      .map((s) => {
        if (s.xs.length === 0) return null;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < s.xs.length; i++) {
          const d = Math.abs(s.xs[i] - dataX);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return { label: s.label, color: s.color, x: s.xs[best], y: s.ys[best] };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
    if (vals.length === 0) return null;
    return { year: Math.round(vals[0].x), vals };
  }, [hoverX, series, xMin, xMax]);

  return (
    <div className="chart">
      {title && <div className="chart-title">{title}</div>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        onMouseMove={(e) => {
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          setHoverX(((e.clientX - rect.left) / rect.width) * width);
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {gridYs.map((g, i) => (
          <g key={i}>
            <line x1={pad.l} x2={width - pad.r} y1={g.y} y2={g.y} className="chart-grid" />
            <text x={pad.l - 4} y={g.y + 3} className="chart-tick" textAnchor="end">
              {yFormat(g.v)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={height - 5} className="chart-tick">
          {Math.round(xMin)}
        </text>
        <text x={width - pad.r} y={height - 5} className="chart-tick" textAnchor="end">
          Year {Math.round(xMax)}
        </text>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {hover && hoverX !== null && (
          <line x1={hoverX} x2={hoverX} y1={pad.t} y2={height - pad.b} className="chart-crosshair" />
        )}
      </svg>
      {hover && (
        <div className="chart-tooltip">
          <b>Year {hover.year}</b>
          {hover.vals.slice(0, 6).map((v) => (
            <span key={v.label}>
              <span className="dot" style={{ background: v.color }} /> {v.label}: {yFormat(v.y)}
            </span>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="chart-legend">
          {series.slice(0, 8).map((s) => (
            <span key={s.label} className="legend-item">
              <span className="dot" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
