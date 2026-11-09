/**
 * Parameter sweeps: pick any numeric input, a range and a step count; recompute every output.
 * Parameters are addressed by a stable key (e.g. "payload:<id>.position.y", "pendulum.armLength")
 * and shown with a friendly label (e.g. "Battery.position.y").
 */
import { withMass } from './payload';
import { computeAll, type Results } from './results';
import type { RobotConfig } from './types';

export type Quantity = 'length' | 'mass' | 'angle' | 'speed' | 'none';

export interface SweepParam {
  key: string;
  label: string;
  quantity: Quantity;
  get: (c: RobotConfig) => number;
  set: (c: RobotConfig, v: number) => RobotConfig;
}

const AX = ['x', 'y', 'z'] as const;

function vecParams(
  keyBase: string,
  labelBase: string,
  get: (c: RobotConfig) => readonly number[],
  set: (c: RobotConfig, v: [number, number, number]) => RobotConfig,
  quantity: Quantity,
): SweepParam[] {
  return AX.map((a, i) => ({
    key: `${keyBase}.${a}`,
    label: `${labelBase}.${a}`,
    quantity,
    get: (c) => get(c)[i],
    set: (c, v) => {
      const vec = [...get(c)] as [number, number, number];
      vec[i] = v;
      return set(c, vec);
    },
  }));
}

export function listSweepParams(cfg: RobotConfig): SweepParam[] {
  const P: SweepParam[] = [
    { key: 'shell.outerRadius', label: 'Shell.radius', quantity: 'length', get: (c) => c.shell.outerRadius, set: (c, v) => ({ ...c, shell: { ...c.shell, outerRadius: v } }) },
    { key: 'shell.thickness', label: 'Shell.thickness', quantity: 'length', get: (c) => c.shell.thickness, set: (c, v) => ({ ...c, shell: { ...c.shell, thickness: v } }) },
    { key: 'shell.mass', label: 'Shell.mass', quantity: 'mass', get: (c) => c.shell.mass, set: (c, v) => ({ ...c, shell: { ...c.shell, mass: v } }) },
    { key: 'axle.mass', label: 'Axle.mass', quantity: 'mass', get: (c) => c.axle.mass, set: (c, v) => ({ ...c, axle: { ...c.axle, mass: v } }) },
    { key: 'frameBox.mass', label: 'FrameBox.mass', quantity: 'mass', get: (c) => c.frameBox.mass, set: (c, v) => ({ ...c, frameBox: { ...c.frameBox, mass: v } }) },
    { key: 'pendulum.bobMass', label: 'Pendulum.mass', quantity: 'mass', get: (c) => c.pendulum.bobMass, set: (c, v) => ({ ...c, pendulum: { ...c.pendulum, bobMass: v } }) },
    { key: 'pendulum.armMass', label: 'Pendulum.armMass', quantity: 'mass', get: (c) => c.pendulum.armMass, set: (c, v) => ({ ...c, pendulum: { ...c.pendulum, armMass: v } }) },
    { key: 'pendulum.armLength', label: 'Pendulum.armLength', quantity: 'length', get: (c) => c.pendulum.armLength, set: (c, v) => ({ ...c, pendulum: { ...c.pendulum, armLength: v } }) },
    { key: 'pendulum.pivot.y', label: 'Pendulum.pivot.y', quantity: 'length', get: (c) => c.pendulum.pivot[1], set: (c, v) => ({ ...c, pendulum: { ...c.pendulum, pivot: [c.pendulum.pivot[0], v, c.pendulum.pivot[2]] } }) },
    { key: 'pendulum.pivot.z', label: 'Pendulum.pivot.z', quantity: 'length', get: (c) => c.pendulum.pivot[2], set: (c, v) => ({ ...c, pendulum: { ...c.pendulum, pivot: [c.pendulum.pivot[0], c.pendulum.pivot[1], v] } }) },
    { key: 'pose.thetaP', label: 'Pose.thetaP', quantity: 'angle', get: (c) => c.pose.thetaP, set: (c, v) => ({ ...c, pose: { ...c.pose, thetaP: v } }) },
    { key: 'pose.beta', label: 'Pose.beta', quantity: 'angle', get: (c) => c.pose.beta, set: (c, v) => ({ ...c, pose: { ...c.pose, beta: v } }) },
    { key: 'pose.shellRoll', label: 'Pose.shellRoll', quantity: 'angle', get: (c) => c.pose.shellRoll, set: (c, v) => ({ ...c, pose: { ...c.pose, shellRoll: v } }) },
    { key: 'drive.gearRatio', label: 'Drive.gearRatio', quantity: 'none', get: (c) => c.drive.gearRatio, set: (c, v) => ({ ...c, drive: { ...c.drive, gearRatio: v } }) },
    { key: 'drive.speed', label: 'Drive.speed', quantity: 'speed', get: (c) => c.drive.speed, set: (c, v) => ({ ...c, drive: { ...c.drive, speed: v } }) },
  ];
  if (cfg.frameBox.enabled)
    P.push(
      ...vecParams('frameBox.position', 'FrameBox.position', (c) => c.frameBox.position, (c, v) => ({ ...c, frameBox: { ...c.frameBox, position: v } }), 'length'),
    );
  for (const p of cfg.payloads) {
    const upd = (c: RobotConfig, f: (x: (typeof c.payloads)[number]) => (typeof c.payloads)[number]): RobotConfig => ({
      ...c,
      payloads: c.payloads.map((x) => (x.id === p.id ? f(x) : x)),
    });
    const find = (c: RobotConfig) => c.payloads.find((x) => x.id === p.id)!;
    P.push({
      key: `payload:${p.id}.mass`,
      label: `${p.name}.mass`,
      quantity: 'mass',
      get: (c) => find(c).mass,
      set: (c, v) => upd(c, (x) => withMass(x, v)),
    });
    P.push(
      ...vecParams(`payload:${p.id}.position`, `${p.name}.position`, (c) => find(c).position, (c, v) => upd(c, (x) => ({ ...x, position: v })), 'length'),
    );
  }
  return P;
}

export function findSweepParam(cfg: RobotConfig, keyOrLabel: string): SweepParam | undefined {
  const all = listSweepParams(cfg);
  return all.find((p) => p.key === keyOrLabel) ?? all.find((p) => p.label === keyOrLabel);
}

export interface SweepRow {
  value: number;
  results: Results;
}

export function runSweep(cfg: RobotConfig, keyOrLabel: string, from: number, to: number, steps: number): SweepRow[] {
  const p = findSweepParam(cfg, keyOrLabel);
  if (!p) throw new Error(`Unknown sweep parameter: ${keyOrLabel}`);
  const n = Math.max(2, Math.floor(steps));
  const rows: SweepRow[] = [];
  for (let i = 0; i < n; i++) {
    const value = from + ((to - from) * i) / (n - 1);
    rows.push({ value, results: computeAll(p.set(cfg, value), { checks: false, wobble: false }) });
  }
  return rows;
}
