/**
 * Milestone 5: animated playback of a steady turn (Singhal et al. eqs. 20–22, RK4), top view,
 * with the closed-form eq. 29 circle overlaid, plus the lean angle θ(t) against the eq. 25–27 prediction.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { simulateTurn, type PlaybackResult } from '../../physics/playback';
import { SMALL_ANGLE_LIMIT } from '../../physics/turning';
import type { Table } from '../../physics/curves';
import { toCSV } from '../../physics/curves';
import { useStore } from '../../state/store';
import { download, slug } from '../download';
import { useResults } from '../hooks';
import { fmt, fromDeg, toDeg } from '../units';
import { BAND, GRID, INK, REF, SERIES } from './theme';

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10];

function useAnimationTime(duration: number, playing: boolean, rate: number, reset: unknown) {
  const [t, setT] = useState(0);
  const last = useRef<number | null>(null);
  useEffect(() => setT(0), [reset]);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      // compute the step here, not inside the updater: React may run the updater after last.current moves on
      const step = last.current === null ? 0 : ((now - last.current) / 1000) * rate;
      last.current = now;
      if (step > 0) setT((t) => (t + step) % Math.max(duration, 1e-6));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, duration]);
  return [t, setT] as const;
}

function TopView({ sim, idx, R }: { sim: PlaybackResult; idx: number; R: number }) {
  const s = sim.samples;
  const rho = sim.rhoClosedForm;
  // fixed bounds from the whole run + the closed-form circle, so the view does not jump
  const b = useMemo(() => {
    let x0 = Math.min(...s.map((q) => q.x)), x1 = Math.max(...s.map((q) => q.x));
    let y0 = Math.min(...s.map((q) => q.y)), y1 = Math.max(...s.map((q) => q.y));
    if (Number.isFinite(rho) && rho < 1e4) {
      x0 = Math.min(x0, sim.centre[0] - rho); x1 = Math.max(x1, sim.centre[0] + rho);
      y0 = Math.min(y0, sim.centre[1] - rho); y1 = Math.max(y1, sim.centre[1] + rho);
    }
    const pad = R * 1.5;
    const span = Math.max(x1 - x0, y1 - y0) + 2 * pad;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x0: cx - span / 2, y0: cy - span / 2, span };
  }, [s, rho, sim.centre, R]);
  // SVG y grows downward: map ground y (left) to −y so left is up on screen, x forward to the right.
  const X = (x: number) => x;
  const Y = (y: number) => -y;
  const cur = s[idx];
  const pts = s.slice(0, idx + 1).map((q) => `${X(q.x)},${Y(q.y)}`).join(' ');
  const full = s.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ');
  const sw = b.span / 400; // stroke width ≈ 1 px at 400 px
  const head = [Math.cos(cur.phi), Math.sin(cur.phi)];
  // the ball drawn as its ground footprint, shifted by the lean so the wobble is visible
  const LEAN_EXAGGERATION = 4;
  const leanShift = LEAN_EXAGGERATION * R * Math.sin(-cur.theta); // + = left (paper θ > 0 leans right)
  const scaleBar = niceLength(b.span / 4);
  return (
    <svg className="pb-top" viewBox={`${b.x0} ${-(b.y0 + b.span)} ${b.span} ${b.span}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Top view of the simulated path">
      <rect x={b.x0} y={-(b.y0 + b.span)} width={b.span} height={b.span} fill="#fcfcfb" />
      {Number.isFinite(rho) && rho < 1e4 && (
        <circle cx={X(sim.centre[0])} cy={Y(sim.centre[1])} r={rho} fill="none" stroke={INK.primary} strokeWidth={sw * 1.5} strokeDasharray={`${sw * 6} ${sw * 4}`} />
      )}
      <polyline points={full} fill="none" stroke={GRID} strokeWidth={sw * 1.5} />
      <polyline points={pts} fill="none" stroke={SERIES[0]} strokeWidth={sw * 2} strokeLinejoin="round" />
      <circle cx={0} cy={0} r={sw * 3} fill={REF} />
      <g transform={`translate(${X(cur.x)} ${Y(cur.y)})`}>
        <circle r={R} fill="rgba(42,120,214,0.10)" stroke={SERIES[0]} strokeWidth={sw * 1.5} />
        <line x1={0} y1={0} x2={head[0] * R * 1.6} y2={-head[1] * R * 1.6} stroke={INK.primary} strokeWidth={sw * 2} />
        {/* lean marker: displaced sideways by R·sin(lean), exaggerated ×4 so the wobble is visible */}
        <circle cx={-head[1] * leanShift} cy={-head[0] * leanShift} r={R * 0.18} fill={SERIES[1]} />
      </g>
      {/* scale bar */}
      <g transform={`translate(${b.x0 + b.span * 0.04} ${-(b.y0 + b.span * 0.05)})`}>
        <line x1={0} y1={0} x2={scaleBar} y2={0} stroke={INK.secondary} strokeWidth={sw * 2} />
        <text x={scaleBar / 2} y={-sw * 6} fontSize={sw * 12} textAnchor="middle" fill={INK.secondary}>
          {fmt(scaleBar * 1000, 0)} mm
        </text>
      </g>
    </svg>
  );
}

function niceLength(x: number) {
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

function LeanTrace({ sim, idx }: { sim: PlaybackResult; idx: number }) {
  const all = sim.samples;
  const T = all[all.length - 1].t;
  const tNow = all[idx].t;
  // sliding window of ~8 wobble periods so individual oscillations stay readable
  const period = Number.isFinite(sim.omega) && sim.omega > 0 ? (2 * Math.PI) / sim.omega : T;
  const Wt = Math.min(T, 8 * period);
  const t0 = Math.min(Math.max(0, tNow - 0.75 * Wt), Math.max(0, T - Wt));
  const s = all.filter((q) => q.t >= t0 && q.t <= t0 + Wt);
  const thAll = all.map((q) => toDeg(-q.theta)); // this app's sign: + = leaning left
  const th = s.map((q) => toDeg(-q.theta));
  const lo = Math.min(0, ...thAll), hi = Math.max(0, ...thAll);
  const pad = (hi - lo) * 0.1 || 1;
  const W = 400, H = 150, ml = 40, mb = 22, mt = 8;
  const X = (t: number) => ml + ((W - ml - 8) * (t - t0)) / (Wt || 1);
  const Y = (d: number) => mt + ((H - mt - mb) * (hi + pad - d)) / (hi - lo + 2 * pad);
  const A = toDeg(sim.amplitude) * Math.sign(thAll.reduce((a, b) => a + b, 0) || 1);
  const pts = s.map((q, i) => `${X(q.t)},${Y(th[i])}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg className="pb-lean" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lean angle over time">
      <rect x={ml} y={mt} width={W - ml - 8} height={H - mt - mb} fill="#fcfcfb" stroke={GRID} />
      <rect x={ml} y={Math.min(Y(0), Y(2 * A))} width={W - ml - 8} height={Math.abs(Y(0) - Y(2 * A))} fill={BAND} />
      <line x1={ml} x2={W - 8} y1={Y(A)} y2={Y(A)} stroke={INK.primary} strokeDasharray="5 4" strokeWidth={1.2} />
      <polyline points={pts} fill="none" stroke={SERIES[1]} strokeWidth={1.8} />
      <line x1={X(tNow)} x2={X(tNow)} y1={mt} y2={H - mb} stroke={INK.primary} strokeWidth={1} />
      {ticks.map((d) => (
        <text key={d} x={ml - 4} y={Y(d) + 3} fontSize={10} textAnchor="end" fill={INK.secondary}>
          {fmt(d, 1)}°
        </text>
      ))}
      <text x={(W + ml) / 2} y={H - 4} fontSize={10} textAnchor="middle" fill={INK.secondary}>
        lean [°, + left] vs time, {fmt(t0, 1)}–{fmt(t0 + Wt, 1)} s
      </text>
      <text x={ml + 4} y={mt + 11} fontSize={10} textAnchor="start" fill={INK.primary}>
        dashed: mean lean A (eq. 26) · shaded: 0…2A
      </text>
    </svg>
  );
}

export function Playback() {
  const cfg = useStore((s) => s.config);
  const r = useResults();
  const p = r.turning.params;
  const [betaDeg, setBetaDeg] = useState(5);
  const [v, setV] = useState(() => Math.min(cfg.drive.speed, Math.max(r.speed.vMax, 0.1)));
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  const sim = useMemo(() => simulateTurn(p, v, fromDeg(betaDeg)), [p, v, betaDeg]);
  const T = sim.samples[sim.samples.length - 1].t;
  const [t, setT] = useAnimationTime(T, playing, rate, sim);
  const dts = T / (sim.samples.length - 1);
  const idx = Math.min(sim.samples.length - 1, Math.max(0, Math.round(t / dts)));
  const cur = sim.samples[idx];
  const table: Table = {
    columns: [
      { key: 't', label: 'time', unit: 's' },
      { key: 'x', label: 'x (forward at t = 0)', unit: 'm' },
      { key: 'y', label: 'y (left)', unit: 'm' },
      { key: 'phi', label: 'heading φ', unit: 'rad' },
      { key: 'theta', label: 'lean θ (paper sign: + = right)', unit: 'rad' },
      { key: 'psi', label: 'spin ψ', unit: 'rad' },
    ],
    rows: sim.samples.map((q) => ({ ...q })),
  };
  const outside = Math.abs(fromDeg(betaDeg)) > SMALL_ANGLE_LIMIT;
  const err = (sim.rhoSimulated - sim.rhoClosedForm) / sim.rhoClosedForm;
  return (
    <div className="chart playback">
      <div className="chart-head">
        <span className="chart-title">Playback — steady turn, Singhal et al. eqs. 20–22 (RK4)</span>
        <span className="sweep-controls">
          <label className="sweep-field">
            β [°]
            <input type="number" step={1} value={betaDeg} onChange={(e) => Number.isFinite(+e.target.value) && setBetaDeg(+e.target.value)} />
          </label>
          <label className="sweep-field">
            v [m/s]
            <input type="number" step={0.1} min={0} value={+v.toFixed(3)} onChange={(e) => Number.isFinite(+e.target.value) && +e.target.value >= 0 && setV(+e.target.value)} />
          </label>
          <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={() => setT(0)}>Restart</button>
          <label className="sweep-field">
            speed
            <select value={rate} onChange={(e) => setRate(+e.target.value)}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <input
            type="range"
            min={0}
            max={T}
            step={T / 1000}
            value={t}
            aria-label="time"
            onChange={(e) => {
              setPlaying(false);
              setT(+e.target.value);
            }}
          />
        </span>
        <span className="chart-actions">
          <button title="Download the simulated time series as CSV (SI)" onClick={() => download(`${slug(cfg.name)}-playback.csv`, new Blob([toCSV(table)], { type: 'text/csv' }))}>
            CSV
          </button>
        </span>
      </div>
      <div className="chart-note">
        Blue: simulated path (CoM ground track); dashed black: closed-form eq. 29 circle, centred on the mean path. Orange dot: lean side (offset exaggerated ×4). β is measured from trim; the
        model ignores drive limits and assumes small β and θ.{outside && <b className="bad-text"> |β| &gt; 15°: outside the paper's small-angle range.</b>}
      </div>
      <div className="pb-body">
        <TopView sim={sim} idx={idx} R={cfg.shell.outerRadius} />
        <div className="pb-side">
          <table className="pb-stats">
            <tbody>
              <tr><td>time</td><td>{fmt(cur.t, 2)} s</td></tr>
              <tr><td>heading φ</td><td>{fmt(toDeg(cur.phi), 1)}°</td></tr>
              <tr><td>lean (+ left)</td><td>{fmt(toDeg(-cur.theta), 2)}°</td></tr>
              <tr><td>spin rate ψ̇</td><td>{fmt(v / cfg.shell.outerRadius, 2)} rad/s</td></tr>
              <tr><td>ρ closed form (eq. 29)</td><td>{fmt(sim.rhoClosedForm * 1000, 0)} mm</td></tr>
              <tr><td>ρ simulated (path / Δφ)</td><td>{Number.isFinite(sim.rhoSimulated) ? `${fmt(sim.rhoSimulated * 1000, 0)} mm (${err >= 0 ? '+' : ''}${fmt(err * 100, 1)} %)` : 'straight'}</td></tr>
              <tr><td>wobble A, ω (eqs. 26–27)</td><td>{fmt(toDeg(sim.amplitude), 2)}°, {fmt(sim.omega, 2)} rad/s</td></tr>
            </tbody>
          </table>
          <LeanTrace sim={sim} idx={idx} />
        </div>
      </div>
    </div>
  );
}
