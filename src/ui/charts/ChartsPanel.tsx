/**
 * The six charts (spec §6). Display units: speed m/s, lengths mm (turning radius, CoM), angles deg,
 * torque N·m, inertia kg·m². CSV exports keep SI with the unit in each header.
 */
import type { Data, Layout } from 'plotly.js-dist-min';
import { useDeferredValue, useMemo, type ReactNode } from 'react';
import { pitchTable, sweepTable, torqueTable, turningTable, type Table } from '../../physics/curves';
import type { Results } from '../../physics/results';
import { listSweepParams, runSweep, type Quantity, type SweepParam } from '../../physics/sweep';
import { SMALL_ANGLE_LIMIT } from '../../physics/turning';
import type { RobotConfig } from '../../physics/types';
import { useStore, type ChartTab, type SweepSettings } from '../../state/store';
import { useResults } from '../hooks';
import { fmt, toDeg } from '../units';
import { Chart } from './Plot';
import { BAND, baseLayout, finite, INK, REF, SERIES } from './theme';

const mm = (a: number[]) => finite(a.map((v) => v * 1000));
const degs = (a: number[]) => finite(a.map(toDeg));
const col = (t: Table, k: string) => t.rows.map((r) => r[k]);

const DASHES = ['solid', 'dash', 'dot', 'dashdot', 'longdash'] as const;
/** Tilt beyond which eq. 29 is outside the paper's small-angle analysis (deg). */
const VALIDITY_DEG = 15;

type Shape = NonNullable<Layout['shapes']>[number];
type Annotation = NonNullable<Layout['annotations']>[number];

function vline(x: number, label: string, color = REF): { shape: Partial<Shape>; ann: Partial<Annotation> } {
  return {
    shape: { type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1, line: { color, width: 1.5, dash: 'dash' } },
    ann: { xref: 'x', yref: 'paper', x, y: 1, yanchor: 'bottom', text: label, showarrow: false, font: { color: INK.secondary, size: 11 } },
  };
}

/* ----------------------------------------------------------------- 1. turning */

function TurningChart({ cfg, r }: { cfg: RobotConfig; r: Results }) {
  const t = useMemo(() => turningTable(cfg, r), [cfg, r]);
  const v = col(t, 'v');
  const betaAvailDeg = toDeg(r.turning.betaAvail);
  const outside = r.turning.betaAvail > SMALL_ANGLE_LIMIT;
  // Range on the turning curves (the traction floor → 0 as v → 0 and would squash everything else).
  const all = t.rows.flatMap((row) => [row.rho_b5, row.rho_b10, row.rho_b15, row.rho_avail, row.rho_min, row.rho_kin].filter((x) => Number.isFinite(x) && x > 0));
  const yMin = Math.max(1e-4, Math.min(...all)) * 0.4;
  const yMax = Math.max(...all) * 1.6;
  const data: Data[] = [
    // shaded region below the β = 15° curve: tilts above the small-angle validity of eq. 29
    { x: v, y: v.map(() => yMin * 1000), mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
    {
      x: v,
      y: mm(col(t, `rho_b${VALIDITY_DEG}`)),
      mode: 'lines',
      fill: 'tonexty',
      fillcolor: BAND,
      line: { width: 0 },
      name: `β > ${VALIDITY_DEG}° (outside small-angle validity)`,
      hoverinfo: 'skip',
    },
    ...([5, 10, 15] as const).map((b, i) => ({
      x: v,
      y: mm(col(t, `rho_b${b}`)),
      mode: 'lines' as const,
      name: `β = ${b}°`,
      line: { color: SERIES[i], width: 2, dash: DASHES[i + 1] },
      hovertemplate: '%{y:.0f} mm',
    })),
    {
      x: v,
      y: mm(col(t, 'rho_avail')),
      mode: 'lines',
      name: `β_avail = ${fmt(betaAvailDeg, 1)}°${outside ? ' (outside validity)' : ''}`,
      line: { color: SERIES[3], width: 2.5, dash: 'solid' },
      hovertemplate: '%{y:.0f} mm',
    },
    {
      x: v,
      y: mm(col(t, 'rho_kin')),
      mode: 'lines',
      name: 'kinematic R/tanφ at β_avail (cross-check)',
      line: { color: SERIES[4], width: 1.5, dash: 'dash' },
      hovertemplate: '%{y:.0f} mm',
    },
    {
      x: v,
      y: mm(col(t, 'traction')),
      mode: 'lines',
      name: 'traction floor v²/(μg)',
      line: { color: REF, width: 1.5, dash: 'longdashdot' },
      hovertemplate: '%{y:.0f} mm',
    },
    {
      x: v,
      y: mm(col(t, 'rho_min')),
      mode: 'lines',
      name: 'ρ_min',
      line: { color: INK.primary, width: 3.5 },
      hovertemplate: '<b>%{y:.0f} mm</b>',
    },
    {
      x: [cfg.drive.speed],
      y: [r.turning.rhoMinAtSpeed * 1000],
      mode: 'markers',
      name: 'current speed',
      marker: { color: INK.primary, size: 9, symbol: 'circle-open', line: { width: 2 } },
      hovertemplate: 'ρ_min %{y:.0f} mm at %{x:.2f} m/s',
    },
  ];
  const vm = vline(r.speed.vMax, `v_max ${fmt(r.speed.vMax, 2)} m/s`);
  const layout: Partial<Layout> = {
    ...baseLayout('speed v [m/s]', 'turning radius ρ [mm] (log)'),
    yaxis: { ...baseLayout('', 'turning radius ρ [mm] (log)').yaxis, type: 'log', range: [Math.log10(yMin * 1000), Math.log10(yMax * 1000)] },
    shapes: r.speed.vMax > 0 ? [vm.shape] : [],
    annotations: r.speed.vMax > 0 ? [vm.ann] : [],
  };
  return (
    <Chart
      id="turning-radius-vs-speed"
      title="Turning radius vs speed — Singhal et al. 2023 eq. 29"
      data={data}
      layout={layout}
      table={t}
      note={<>Bold: ρ_min = max(eq. 29 at β_avail, traction floor). β measured from trim β₀. Shaded: tilts beyond 15°, outside the paper's small-angle analysis.</>}
    />
  );
}

/* ----------------------------------------------------------------- 2. torque */

function TorqueChart({ cfg, r }: { cfg: RobotConfig; r: Results }) {
  const t = useMemo(() => torqueTable(cfg, r), [cfg, r]);
  const v = col(t, 'v');
  const data: Data[] = [
    { x: v, y: finite(col(t, 'gravity')), mode: 'lines', name: 'pendulum gravity limit τ_g(θp,max)', line: { color: SERIES[2], width: 1.5, dash: 'dot' }, hovertemplate: '%{y:.3f} N·m' },
    { x: v, y: finite(col(t, 'motor')), mode: 'lines', name: 'motor limit Nτ_stall(1 − Nv/(Rω₀))', line: { color: SERIES[3], width: 1.5, dash: 'dash' }, hovertemplate: '%{y:.3f} N·m' },
    { x: v, y: finite(col(t, 'traction')), mode: 'lines', name: 'traction limit μMgR cosα', line: { color: SERIES[4], width: 1.5, dash: 'dashdot' }, hovertemplate: '%{y:.3f} N·m' },
    { x: v, y: finite(col(t, 'required')), mode: 'lines', name: 'required τ_req', line: { color: SERIES[1], width: 2.5 }, hovertemplate: '%{y:.3f} N·m' },
    { x: v, y: finite(col(t, 'available')), mode: 'lines', name: 'available τ_avail', line: { color: SERIES[0], width: 3 }, hovertemplate: '<b>%{y:.3f} N·m</b>' },
  ];
  if (r.speed.vMax > 0) {
    const c = r.speed;
    const req = t.rows.reduce((a, b) => (Math.abs(b.v - c.vMax) < Math.abs(a.v - c.vMax) ? b : a)).required;
    data.push({ x: [c.vMax], y: [req], mode: 'markers', name: `v_max (${c.binding})`, marker: { color: INK.primary, size: 10, symbol: 'diamond' }, hovertemplate: 'v_max %{x:.3f} m/s' });
  }
  const vm = vline(r.speed.vMax, `v_max ${fmt(r.speed.vMax, 2)} m/s`);
  const top = Math.max(...col(t, 'required').filter(Number.isFinite), ...col(t, 'available').filter(Number.isFinite)) * 1.3;
  const layout: Partial<Layout> = {
    ...baseLayout('speed v [m/s]', 'torque on the shell [N·m]'),
    yaxis: { ...baseLayout('', 'torque on the shell [N·m]').yaxis, range: [0, top] },
    shapes: r.speed.vMax > 0 ? [vm.shape] : [],
    annotations: r.speed.vMax > 0 ? [vm.ann] : [],
  };
  return <Chart id="torque-vs-speed" title="Available vs required torque" data={data} layout={layout} table={t} note={<>v_max is where τ_avail meets τ_req (binding: {r.speed.binding}).</>} />;
}

/* ----------------------------------------------------------------- 6. drive vs pitch */

function PitchChart({ cfg, r }: { cfg: RobotConfig; r: Results }) {
  const t = useMemo(() => pitchTable(cfg, r), [cfg, r]);
  const th = degs(col(t, 'thetaP')) as number[];
  const tMax = toDeg(cfg.pendulum.thetaPMax);
  const data: Data[] = [
    { x: th, y: finite(col(t, 'tauG')), mode: 'lines', name: 'gravity drive torque τ_g', line: { color: SERIES[0], width: 2.5 }, xaxis: 'x', yaxis: 'y', hovertemplate: '%{y:.3f} N·m' },
    { x: th, y: th.map(() => r.drive.tauMotorMax), mode: 'lines', name: 'motor stall Nτ_stall', line: { color: SERIES[3], width: 1.5, dash: 'dash' }, xaxis: 'x', yaxis: 'y', hovertemplate: '%{y:.3f} N·m' },
    { x: th, y: th.map(() => r.drive.tauTraction), mode: 'lines', name: 'traction μMgR', line: { color: SERIES[4], width: 1.5, dash: 'dashdot' }, xaxis: 'x', yaxis: 'y', hovertemplate: '%{y:.3f} N·m' },
    { x: th, y: degs(col(t, 'slope')), mode: 'lines', name: 'slope limit α (gravity)', line: { color: SERIES[1], width: 2.5 }, xaxis: 'x', yaxis: 'y2', hovertemplate: '%{y:.1f}°' },
  ];
  const b = baseLayout('pendulum pitch θp [°]', '');
  const lines = [-tMax, tMax].map((x) => ({ type: 'line' as const, xref: 'x' as const, yref: 'paper' as const, x0: x, x1: x, y0: 0, y1: 1, line: { color: REF, width: 1.5, dash: 'dash' as const } }));
  const cur = { type: 'line' as const, xref: 'x' as const, yref: 'paper' as const, x0: toDeg(cfg.pose.thetaP), x1: toDeg(cfg.pose.thetaP), y0: 0, y1: 1, line: { color: INK.primary, width: 1 } };
  // Show the motor and traction limits too (they decide which term binds), unless they are off-scale.
  const tauG = Math.max(r.drive.tauGMax, ...col(t, 'tauG'));
  const tauTop = Math.min(Math.max(tauG, r.drive.tauMotorMax, r.drive.tauTraction) * 1.1, tauG * 5);
  const layout: Partial<Layout> = {
    ...b,
    // two stacked panels sharing θp — not a dual axis
    grid: { rows: 2, columns: 1, roworder: 'top to bottom' },
    xaxis: { ...b.xaxis, range: [-90, 90], dtick: 15 },
    yaxis: { ...b.yaxis, title: { text: 'torque [N·m]', font: { color: INK.secondary, size: 12 } }, domain: [0.55, 1], range: [Math.min(0, ...col(t, 'tauG')) * 1.1, tauTop] },
    yaxis2: { ...b.yaxis, title: { text: 'slope α [°]', font: { color: INK.secondary, size: 12 } }, domain: [0, 0.42], anchor: 'x' },
    shapes: [...lines, cur],
    annotations: [{ xref: 'x', yref: 'paper', x: tMax, y: 1, yanchor: 'bottom', text: `θp,max ${fmt(tMax, 0)}°`, showarrow: false, font: { color: INK.secondary, size: 11 } }],
  };
  return <Chart id="drive-vs-pitch" title="Drive torque and slope limit vs pendulum pitch" data={data} layout={layout} table={t} note={<>Thin vertical line: current θp. τ_max = min(τ_g(θp,max), Nτ_stall, μMgR) = {fmt(r.drive.tauMax, 3)} N·m ({r.drive.binding}).</>} />;
}

/* ----------------------------------------------------------------- sweep (charts 3–5) */

const QUNIT: Record<Quantity, { unit: string; k: number }> = {
  length: { unit: 'mm', k: 1000 },
  mass: { unit: 'kg', k: 1 },
  angle: { unit: '°', k: 180 / Math.PI },
  speed: { unit: 'm/s', k: 1 },
  none: { unit: '', k: 1 },
};

export function defaultSweep(cfg: RobotConfig, params: SweepParam[], key?: string): SweepSettings {
  const p = params.find((x) => x.key === key) ?? params.find((x) => x.key.startsWith('payload:') && x.key.endsWith('.position.y')) ?? params.find((x) => x.key === 'pendulum.armLength')!;
  const v = p.get(cfg);
  const R = cfg.shell.outerRadius;
  let from: number, to: number;
  if (p.quantity === 'length') {
    const span = p.key.includes('position') || p.key.includes('pivot') ? R * 0.4 : Math.max(Math.abs(v) * 0.5, R * 0.1);
    [from, to] = [v - span, v + span];
  } else if (p.quantity === 'angle') [from, to] = [-cfg.pendulum.betaMax, cfg.pendulum.betaMax];
  else [from, to] = [Math.max(0, v * 0.5), v * 1.5 || 1];
  if (p.quantity === 'length' && !p.key.includes('position') && !p.key.includes('pivot')) from = Math.max(0, from);
  return { key: p.key, from, to, steps: 41 };
}

function SweepControls({ params, s, set, makeDefault }: { params: SweepParam[]; s: SweepSettings; set: (s: SweepSettings) => void; makeDefault: (key: string) => SweepSettings }) {
  const p = params.find((x) => x.key === s.key)!;
  const q = QUNIT[p.quantity];
  const num = (label: string, value: number, on: (v: number) => void, step = 1) => (
    <label className="sweep-field">
      {label}
      <input type="number" step={step} defaultValue={+value.toFixed(4)} key={`${s.key}-${label}-${value}`} onBlur={(e) => on(parseFloat(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && on(parseFloat((e.target as HTMLInputElement).value))} />
    </label>
  );
  return (
    <span className="sweep-controls">
      <label className="sweep-field">
        Sweep
        <select value={s.key} onChange={(e) => set({ ...makeDefault(e.target.value), steps: s.steps })}>
          {params.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {num(`from [${q.unit || '–'}]`, s.from * q.k, (v) => Number.isFinite(v) && set({ ...s, from: v / q.k }))}
      {num(`to [${q.unit || '–'}]`, s.to * q.k, (v) => Number.isFinite(v) && set({ ...s, to: v / q.k }))}
      {num('steps', s.steps, (v) => Number.isFinite(v) && set({ ...s, steps: Math.max(2, Math.min(201, Math.round(v))) }))}
    </span>
  );
}

function SweepCharts({ tab, cfg }: { tab: 'trim' | 'com' | 'principal'; cfg: RobotConfig }) {
  const params = useMemo(() => listSweepParams(cfg), [cfg]);
  const stored = useStore((s) => s.sweep);
  const setSweep = useStore((s) => s.setSweep);
  const valid = stored && params.some((p) => p.key === stored.key) ? stored : null;
  const s = valid ?? defaultSweep(cfg, params);
  const p = params.find((x) => x.key === s.key)!;
  const q = QUNIT[p.quantity];
  // Sweeps recompute every output per step: defer so editing stays responsive.
  const dCfg = useDeferredValue(cfg);
  const dS = useDeferredValue(s);
  const rows = useMemo(() => runSweep(dCfg, dS.key, dS.from, dS.to, dS.steps), [dCfg, dS]);
  const table = useMemo(() => sweepTable(rows, p.label, p.quantity === 'angle' ? 'rad' : p.quantity === 'length' ? 'm' : q.unit, cfg.pendulum.betaMax), [rows, p, q, cfg.pendulum.betaMax]);
  const x = rows.map((r) => r.value * q.k);
  const xTitle = `${p.label}${q.unit ? ` [${q.unit}]` : ''}`;
  const current = p.get(cfg) * q.k;
  const cur = { type: 'line' as const, xref: 'x' as const, yref: 'paper' as const, x0: current, x1: current, y0: 0, y1: 1, line: { color: INK.primary, width: 1 } };
  const controls = <SweepControls params={params} s={s} set={setSweep} makeDefault={(key) => defaultSweep(cfg, params, key)} />;
  const note = <>Thin vertical line: current value. {dS !== s || dCfg !== cfg ? 'Recomputing…' : `${rows.length} steps, every output recomputed per step.`}</>;

  if (tab === 'trim') {
    const bMax = toDeg(cfg.pendulum.betaMax);
    const b0 = degs(col(table, 'beta0'));
    const infeasible = b0.filter((v) => v === null).length;
    const data: Data[] = [
      { x, y: x.map(() => -bMax), mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
      { x, y: x.map(() => bMax), mode: 'lines', fill: 'tonexty', fillcolor: BAND, line: { color: REF, width: 1, dash: 'dash' }, name: `±β_max (${fmt(bMax, 0)}°)`, hoverinfo: 'skip' },
      { x, y: b0, mode: 'lines+markers', name: 'trim tilt β₀', line: { color: SERIES[0], width: 2.5 }, marker: { size: 5 }, hovertemplate: 'β₀ %{y:.2f}°' },
    ];
    const lim = Math.max(bMax * 1.3, ...b0.filter((v): v is number => v !== null).map(Math.abs)) ;
    const layout: Partial<Layout> = { ...baseLayout(xTitle, 'trim tilt β₀ [°]'), shapes: [cur], yaxis: { ...baseLayout('', 'trim tilt β₀ [°]').yaxis, range: [-lim, lim] } };
    return (
      <Chart id="trim-tilt-sweep" title="Trim tilt β₀ vs swept parameter" data={data} layout={layout} table={table} controls={controls}
        note={<>{note} Shaded: the tilt range ±β_max. {infeasible > 0 && <b className="bad-text">Gaps: {infeasible} step(s) cannot trim (payload too far off-centre).</b>}</>} />
    );
  }
  if (tab === 'com') {
    const keys = [['x', 'CoM x'], ['y', 'CoM y'], ['z', 'CoM z'], ['offset', '|CoM offset|']] as const;
    const data: Data[] = keys.map(([k, name], i) => ({ x, y: mm(col(table, k)), mode: 'lines', name, line: { color: SERIES[i], width: k === 'offset' ? 2.5 : 2, dash: DASHES[i] }, hovertemplate: '%{y:.2f} mm' }));
    return <Chart id="com-sweep" title="Combined CoM vs swept parameter" data={data} layout={{ ...baseLayout(xTitle, 'CoM [mm]'), shapes: [cur] }} table={table} controls={controls} note={note} />;
  }
  const data: Data[] = (['I1', 'I2', 'I3'] as const).map((k, i) => ({ x, y: finite(col(table, k)), mode: 'lines', name: `I${['₁', '₂', '₃'][i]}`, line: { color: SERIES[i], width: 2, dash: DASHES[i] }, hovertemplate: '%{y:.4g} kg·m²' }));
  return <Chart id="principal-sweep" title="Principal moments of inertia (about the CoM) vs swept parameter" data={data} layout={{ ...baseLayout(xTitle, 'principal moment [kg·m²]'), shapes: [cur] }} table={table} controls={controls} note={note} />;
}

/* ----------------------------------------------------------------- panel */

const TABS: { id: ChartTab; label: string }[] = [
  { id: 'turning', label: '1 · Turning radius vs speed' },
  { id: 'torque', label: '2 · Torque vs speed' },
  { id: 'trim', label: '3 · Trim tilt sweep' },
  { id: 'com', label: '4 · CoM sweep' },
  { id: 'principal', label: '5 · Principal moments sweep' },
  { id: 'pitch', label: '6 · Drive vs pitch' },
];

export default function ChartsPanel() {
  const tab = useStore((s) => s.chartTab);
  const setTab = useStore((s) => s.setChartTab);
  const cfg = useStore((s) => s.config);
  const r = useResults();
  let body: ReactNode;
  if (tab === 'turning') body = <TurningChart cfg={cfg} r={r} />;
  else if (tab === 'torque') body = <TorqueChart cfg={cfg} r={r} />;
  else if (tab === 'pitch') body = <PitchChart cfg={cfg} r={r} />;
  else body = <SweepCharts tab={tab} cfg={cfg} />;
  return (
    <div className="charts-panel-inner">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="chart-body">{body}</div>
    </div>
  );
}
