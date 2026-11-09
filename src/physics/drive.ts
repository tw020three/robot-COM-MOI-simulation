/**
 * Drive limits (spec §5.2).
 *
 * The steady torque the drive can push into the shell equals the gravity moment of the
 * non-spinning ("inner") mass about the axle:  τ_g(θp) = g·Σ_inner mᵢ·xᵢ(θp)
 * (simple pendulum: m_p·g·r_p·sin θp). Beyond θp,max the pendulum would swing over.
 *
 * Because every inner part is either fixed (frame in arch B) or rotated by Ry(−θp) about a
 * fixed point, the inner first moments are exactly of the form K + A·cosθ + B·sinθ.
 * We extract (K, A, B) from four pose evaluations, which makes sweeps cheap and lets
 * the steady-state pitch be solved in closed form.
 */
import { compositeOf, computeMassProps, posedItems, type MassProps } from './massProps';
import type { RobotConfig } from './types';

/** f(θ) = K + A cosθ + B sinθ */
export interface Trig {
  K: number;
  A: number;
  B: number;
}
export const evalTrig = (t: Trig, th: number) => t.K + t.A * Math.cos(th) + t.B * Math.sin(th);

/** Inner first moments Sx(θp) = Σ m x and Sz(θp) = Σ m z (kg·m) at the config's β. */
export function innerMomentModel(cfg: RobotConfig): { Sx: Trig; Sz: Trig } {
  const at = (th: number) =>
    compositeOf(posedItems(cfg, { ...cfg.pose, thetaP: th }), (it) => it.mount !== 'shell').moment;
  const m0 = at(0), mPi = at(Math.PI), mP = at(Math.PI / 2), mM = at(-Math.PI / 2);
  const fit = (k: 0 | 2): Trig => ({ K: (m0[k] + mPi[k]) / 2, A: (m0[k] - mPi[k]) / 2, B: (mP[k] - mM[k]) / 2 });
  return { Sx: fit(0), Sz: fit(2) };
}

/** Gravity drive torque available at pendulum pitch θp (N·m). */
export const tauGravity = (cfg: RobotConfig, thetaP: number, model = innerMomentModel(cfg)) =>
  cfg.drive.g * evalTrig(model.Sx, thetaP);

export type TorqueLimit = 'pendulum gravity' | 'motor stall' | 'traction';

export interface DriveResult {
  tauGMax: number;
  tauMotorMax: number;
  tauTraction: number;
  tauMax: number;
  binding: TorqueLimit;
  /** Max slope (rad) and its binding constraint; NaN-free: clamps to π/2. */
  maxSlope: number;
  /** Max step height (m), from the CoM offset e = τ_max/(M g). */
  maxStep: number;
  /** Equivalent horizontal CoM offset e (m). */
  e: number;
  /** Flat-ground acceleration with the pendulum held at θp,max (m/s²). */
  accelAtMax: number;
}

/**
 * Flat-ground forward acceleration with the inner assembly held at pitch θp (planar decoupled model).
 * General form (derived in docs/model.md):
 *   a = g·Sx(θ) / [ (M + I_spin/R²)·R − Σ_inner m(−z)(θ) ]
 * which reduces to the spec's m_p g r_p sinθ / ((M + I_spin/R²)R − m_p r_p cosθ) for a pendulum pivoted at O.
 */
export function acceleration(cfg: RobotConfig, thetaP: number, mp: MassProps = computeMassProps(cfg), model = innerMomentModel(cfg)): number {
  const R = cfg.shell.outerRadius;
  const den = (mp.total.mass + mp.Ispin / (R * R)) * R + evalTrig(model.Sz, thetaP);
  return (cfg.drive.g * evalTrig(model.Sx, thetaP)) / den;
}

export function computeDrive(cfg: RobotConfig, mp: MassProps = computeMassProps(cfg), model = innerMomentModel(cfg)): DriveResult {
  const { g, gearRatio: N, stallTorque, mu } = cfg.drive;
  const R = cfg.shell.outerRadius;
  const M = mp.total.mass;
  const tauGMax = tauGravity(cfg, cfg.pendulum.thetaPMax, model);
  const tauMotorMax = N * stallTorque;
  const tauTraction = mu * M * g * R;
  const options: [number, TorqueLimit][] = [
    [tauGMax, 'pendulum gravity'],
    [tauMotorMax, 'motor stall'],
    [tauTraction, 'traction'],
  ];
  options.sort((a, b) => a[0] - b[0]);
  const [tauMax, binding] = options[0];
  const ratio = M > 0 && R > 0 ? tauMax / (M * g * R) : 0;
  const maxSlope = Math.asin(Math.max(-1, Math.min(1, ratio)));
  const e = M > 0 ? Math.max(0, tauMax) / (M * g) : 0;
  const maxStep = e >= R ? R : R - Math.sqrt(R * R - e * e);
  return {
    tauGMax,
    tauMotorMax,
    tauTraction,
    tauMax,
    binding,
    maxSlope,
    maxStep,
    e,
    accelAtMax: acceleration(cfg, cfg.pendulum.thetaPMax, mp, model),
  };
}

/** Samples of drive torque and slope limit vs θp, for chart 6. */
export function driveVsPitch(cfg: RobotConfig, n = 91, mp: MassProps = computeMassProps(cfg)) {
  const model = innerMomentModel(cfg);
  const R = cfg.shell.outerRadius, M = mp.total.mass, g = cfg.drive.g;
  const out: { thetaP: number; tauG: number; slope: number; accel: number }[] = [];
  for (let i = 0; i < n; i++) {
    const th = (-Math.PI / 2) + (Math.PI * i) / (n - 1);
    const tauG = g * evalTrig(model.Sx, th);
    const r = tauG / (M * g * R);
    out.push({ thetaP: th, tauG, slope: Math.asin(Math.max(-1, Math.min(1, r))), accel: acceleration(cfg, th, mp, model) });
  }
  return out;
}
