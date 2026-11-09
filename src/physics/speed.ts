/**
 * Maximum speed (spec §5.3).
 *
 *   τ_req(v)   = R [ c_rr M g cosα + M g sinα + ½ ρ_air C_d A v² ]
 *   τ_avail(v) = min( τ_g(θp,max),  N τ_stall (1 − (N v/R)/ω_noload),  μ M g R cosα )
 *   v_max      = largest v with τ_avail ≥ τ_req, capped at ω_noload R / N
 *
 * The traction term is not in the spec's τ_avail; it is added for consistency with τ_max (§5.2)
 * and is documented in docs/model.md. Set μ large to remove it.
 */
import { evalTrig, innerMomentModel, type Trig } from './drive';
import { computeMassProps, type MassProps } from './massProps';
import type { RobotConfig } from './types';

export type SpeedLimit = 'pendulum gravity' | 'motor torque' | 'traction' | 'motor no-load speed' | 'cannot move';

export interface SpeedContext {
  R: number;
  M: number;
  g: number;
  N: number;
  stall: number;
  omegaNL: number;
  mu: number;
  crr: number;
  cd: number;
  area: number;
  rho: number;
  alpha: number;
  tauGMax: number;
  Sx: Trig;
}

export function speedContext(cfg: RobotConfig, mp: MassProps = computeMassProps(cfg)): SpeedContext {
  const d = cfg.drive;
  const R = cfg.shell.outerRadius;
  const model = innerMomentModel(cfg);
  return {
    R,
    M: mp.total.mass,
    g: d.g,
    N: d.gearRatio,
    stall: d.stallTorque,
    omegaNL: d.noLoadSpeed,
    mu: d.mu,
    crr: d.crr,
    cd: d.cd,
    area: d.frontalArea ?? Math.PI * R * R,
    rho: d.rhoAir,
    alpha: d.slope,
    tauGMax: d.g * evalTrig(model.Sx, cfg.pendulum.thetaPMax),
    Sx: model.Sx,
  };
}

export const tauRequired = (c: SpeedContext, v: number) =>
  c.R * (c.crr * c.M * c.g * Math.cos(c.alpha) + c.M * c.g * Math.sin(c.alpha) + 0.5 * c.rho * c.cd * c.area * v * v);

export function tauAvailableTerms(c: SpeedContext, v: number) {
  const motor = Math.max(0, c.N * c.stall * (1 - (c.N * v) / c.R / c.omegaNL));
  const traction = c.mu * c.M * c.g * c.R * Math.cos(c.alpha);
  return { gravity: c.tauGMax, motor, traction };
}
export function tauAvailable(c: SpeedContext, v: number): number {
  const t = tauAvailableTerms(c, v);
  return Math.min(t.gravity, t.motor, t.traction);
}

export const vNoLoadCap = (c: SpeedContext) => (c.N > 0 ? (c.omegaNL * c.R) / c.N : 0);

export interface SpeedResult {
  vMax: number;
  binding: SpeedLimit;
  vCap: number;
  /** Steady pitch needed at v_max (rad); NaN if gravity cannot supply τ_req. */
  thetaSSAtVmax: number;
}

/**
 * Steady forward pitch θ_ss where the gravity torque equals τ_req.
 * Solves K + A cosθ + B sinθ = τ/g exactly (spec form: asin(τ_req/(m_p g r_p))). NaN if unreachable.
 */
export function steadyPitch(c: SpeedContext, tauReq: number): number {
  const { K, A, B } = c.Sx;
  const amp = Math.hypot(A, B);
  if (amp === 0) return NaN;
  const arg = (tauReq / c.g - K) / amp;
  if (Math.abs(arg) > 1) return NaN;
  const thStar = Math.atan2(B, A);
  return thStar - Math.acos(arg);
}

export function computeSpeed(cfg: RobotConfig, mp: MassProps = computeMassProps(cfg)): SpeedResult {
  const c = speedContext(cfg, mp);
  const vCap = vNoLoadCap(c);
  const f = (v: number) => tauAvailable(c, v) - tauRequired(c, v);
  if (vCap <= 0 || f(0) < 0) return { vMax: 0, binding: 'cannot move', vCap, thetaSSAtVmax: NaN };
  let vMax: number;
  let binding: SpeedLimit;
  if (f(vCap) >= 0) {
    vMax = vCap;
    binding = 'motor no-load speed';
  } else {
    // f is monotone decreasing in v (τ_req ↑, τ_avail ↓), so bisection is safe.
    let a = 0, b = vCap;
    for (let i = 0; i < 200 && b - a > 1e-12 * Math.max(1, vCap); i++) {
      const m = 0.5 * (a + b);
      if (f(m) >= 0) a = m;
      else b = m;
    }
    vMax = a;
    const t = tauAvailableTerms(c, vMax);
    const min = Math.min(t.gravity, t.motor, t.traction);
    binding = min === t.gravity ? 'pendulum gravity' : min === t.motor ? 'motor torque' : 'traction';
  }
  return { vMax, binding, vCap, thetaSSAtVmax: steadyPitch(c, tauRequired(c, vMax)) };
}

/** Torque-vs-speed samples for chart 2. */
export function torqueVsSpeed(cfg: RobotConfig, n = 121, mp: MassProps = computeMassProps(cfg), vEndIn?: number) {
  const c = speedContext(cfg, mp);
  const vEnd = vEndIn ?? Math.max(vNoLoadCap(c), 0.1) * 1.05;
  return Array.from({ length: n }, (_, i) => {
    const v = (vEnd * i) / (n - 1);
    const req = tauRequired(c, v);
    return { v, required: req, available: tauAvailable(c, v), ...tauAvailableTerms(c, v), thetaSS: steadyPitch(c, req) };
  });
}
