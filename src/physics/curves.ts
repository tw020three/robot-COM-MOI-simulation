/**
 * Chart data as plain tables (SI units). The UI converts units for display; CSV export writes
 * the same tables with the unit in each column header.
 */
import { driveVsPitch } from './drive';
import { leanAtBeta } from './trim';
import type { Results } from './results';
import { torqueVsSpeed } from './speed';
import type { SweepRow } from './sweep';
import { rhoKinematic, rhoSinghal, tractionFloor } from './turning';
import type { RobotConfig } from './types';

export interface Column {
  key: string;
  label: string;
  /** SI unit of the stored values. */
  unit: string;
}
export interface Table {
  columns: Column[];
  rows: Record<string, number>[];
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Fixed steering tilts plotted on the turning chart, besides β_avail. */
export const TURN_BETAS_DEG = [5, 10, 15] as const;

/** Upper end of the speed axis: comfortably past v_max and the current speed. */
export function speedAxisEnd(cfg: RobotConfig, r: Results): number {
  return 1.15 * Math.max(r.speed.vMax, cfg.drive.speed, 0.1);
}

/** Chart 1: turning radius vs speed (m vs m/s). */
export function turningTable(cfg: RobotConfig, r: Results, n = 160): Table {
  const p = r.turning.params;
  const vEnd = speedAxisEnd(cfg, r);
  const beta0 = r.trim.beta.feasible ? r.trim.beta.beta0 : 0;
  const rhoKin = rhoKinematic(cfg.shell.outerRadius, leanAtBeta(cfg, beta0 + r.turning.betaAvail));
  const columns: Column[] = [
    { key: 'v', label: 'speed v', unit: 'm/s' },
    ...TURN_BETAS_DEG.map((b) => ({ key: `rho_b${b}`, label: `ρ at β = ${b}°`, unit: 'm' })),
    { key: 'rho_avail', label: 'ρ at β_avail', unit: 'm' },
    { key: 'rho_min', label: 'ρ_min', unit: 'm' },
    { key: 'traction', label: 'traction floor v²/(μg)', unit: 'm' },
    { key: 'rho_kin', label: 'kinematic ρ = R/tanφ (β_avail)', unit: 'm' },
  ];
  const rows: Record<string, number>[] = [];
  for (let i = 1; i <= n; i++) {
    const v = (vEnd * i) / n;
    const row: Record<string, number> = { v };
    for (const b of TURN_BETAS_DEG) row[`rho_b${b}`] = rhoSinghal(p, v, deg(b));
    row.rho_avail = rhoSinghal(p, v, r.turning.betaAvail);
    row.traction = tractionFloor(v, cfg.drive.mu, cfg.drive.g);
    row.rho_min = Math.max(row.rho_avail, row.traction);
    row.rho_kin = rhoKin;
    rows.push(row);
  }
  return { columns, rows };
}

/** Chart 2: available vs required torque (N·m vs m/s). */
export function torqueTable(cfg: RobotConfig, r: Results, n = 160): Table {
  const data = torqueVsSpeed(cfg, n, r.mass, speedAxisEnd(cfg, r));
  return {
    columns: [
      { key: 'v', label: 'speed v', unit: 'm/s' },
      { key: 'available', label: 'available τ', unit: 'N·m' },
      { key: 'required', label: 'required τ', unit: 'N·m' },
      { key: 'gravity', label: 'pendulum gravity limit', unit: 'N·m' },
      { key: 'motor', label: 'motor limit', unit: 'N·m' },
      { key: 'traction', label: 'traction limit', unit: 'N·m' },
      { key: 'thetaSS', label: 'steady pitch θ_ss', unit: 'rad' },
    ],
    rows: data.map((x) => ({ v: x.v, available: x.available, required: x.required, gravity: x.gravity, motor: x.motor, traction: x.traction, thetaSS: x.thetaSS })),
  };
}

/** Chart 6: drive torque and slope limit vs pendulum pitch. */
export function pitchTable(cfg: RobotConfig, r: Results, n = 91): Table {
  return {
    columns: [
      { key: 'thetaP', label: 'pendulum pitch θp', unit: 'rad' },
      { key: 'tauG', label: 'gravity drive torque τ_g', unit: 'N·m' },
      { key: 'slope', label: 'slope limit α', unit: 'rad' },
      { key: 'accel', label: 'flat-ground acceleration', unit: 'm/s²' },
    ],
    rows: driveVsPitch(cfg, n, r.mass).map((x) => ({ thetaP: x.thetaP, tauG: x.tauG, slope: x.slope, accel: x.accel })),
  };
}

/** Charts 3–5: outputs across a parameter sweep. */
export function sweepTable(rows: SweepRow[], paramLabel: string, paramUnit: string, betaMax: number): Table {
  return {
    columns: [
      { key: 'value', label: paramLabel, unit: paramUnit },
      { key: 'beta0', label: 'trim tilt β₀', unit: 'rad' },
      { key: 'betaMax', label: 'β_max', unit: 'rad' },
      { key: 'x', label: 'CoM x', unit: 'm' },
      { key: 'y', label: 'CoM y', unit: 'm' },
      { key: 'z', label: 'CoM z', unit: 'm' },
      { key: 'offset', label: '|CoM offset|', unit: 'm' },
      { key: 'I1', label: 'principal I₁', unit: 'kg·m²' },
      { key: 'I2', label: 'principal I₂', unit: 'kg·m²' },
      { key: 'I3', label: 'principal I₃', unit: 'kg·m²' },
    ],
    rows: rows.map(({ value, results: r }) => ({
      value,
      beta0: r.trim.beta.feasible ? r.trim.beta.beta0 : NaN,
      betaMax,
      x: r.mass.total.com[0],
      y: r.mass.total.com[1],
      z: r.mass.total.com[2],
      offset: r.mass.comOffset,
      I1: r.mass.principal.moments[0],
      I2: r.mass.principal.moments[1],
      I3: r.mass.principal.moments[2],
    })),
  };
}

/** CSV with "label [unit]" headers. Non-finite values are written empty. */
export function toCSV(t: Table): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = t.columns.map((c) => esc(c.unit ? `${c.label} [${c.unit}]` : c.label)).join(',');
  const body = t.rows.map((r) => t.columns.map((c) => (Number.isFinite(r[c.key]) ? String(r[c.key]) : '')).join(','));
  return [head, ...body].join('\n') + '\n';
}
