/**
 * Pendulum trim and lateral statics (spec §5.1).
 */
import { evalTrig, innerMomentModel } from './drive';
import { compositeOf, computeMassProps, posedItems, type MassProps } from './massProps';
import { mulVec, rotX, rotY } from './mat3';
import { mountPoses } from './pose';
import type { RobotConfig } from './types';
import { cross, dot, sub, type Vec3 } from './vec';

export interface BetaTrim {
  /** Lateral first moment of everything except the pendulum group, S_y = Σ m·y (kg·m). */
  Sy: number;
  /** asin argument; |arg| > 1 means the payload is too far off-centre. */
  arg: number;
  feasible: boolean;
  /** Trim tilt β₀ (rad); NaN when infeasible. */
  beta0: number;
  /** |β₀| ≤ β_max */
  withinLimit: boolean;
}

/**
 * β₀ such that the combined CoM lies on the mid-plane (y_cm = 0).
 * With pendulum-group CoM c (pendulum frame) the lateral position after tilt is
 *   y = y_piv + c_y cosβ − c_z sinβ = y_piv + ρ sin(β + δ),  ρ = √(c_y²+c_z²), δ = atan2(c_y, −c_z)
 * For c = (0, 0, −r_p) this is the spec's  m_p(y_piv + r_p sinβ₀) + S_y = 0.
 * y is unaffected by the pitch θp and the shell roll ψ (both rotate about y).
 */
export function trimBeta(cfg: RobotConfig, mp: MassProps = computeMassProps(cfg)): BetaTrim {
  const nonPend = compositeOf(mp.items, (it) => it.mount !== 'pendulum');
  const Sy = nonPend.moment[1];
  const m = mp.pendulum.mass;
  const [, cy, cz] = mp.pendulum.comLocal;
  const rho = Math.hypot(cy, cz);
  const delta = Math.atan2(cy, -cz);
  const yPiv = mp.pivotWorld[1];
  if (m <= 0 || rho <= 0) {
    const arg = Sy === 0 ? 0 : Infinity;
    return { Sy, arg, feasible: arg === 0, beta0: arg === 0 ? 0 : NaN, withinLimit: arg === 0 };
  }
  const arg = -(Sy + m * yPiv) / (m * rho);
  if (Math.abs(arg) > 1) return { Sy, arg, feasible: false, beta0: NaN, withinLimit: false };
  const beta0 = Math.asin(arg) - delta;
  return { Sy, arg, feasible: true, beta0, withinLimit: Math.abs(beta0) <= cfg.pendulum.betaMax + 1e-12 };
}

export interface ThetaTrim {
  feasible: boolean;
  /** Fore/aft trim pitch θ₀ (rad) where x_cm = 0; NaN if no root in [−90°, 90°]. */
  theta0: number;
  withinLimit: boolean;
}

/**
 * θ₀ such that x_cm = 0, by bisection (works for architectures A and B).
 * x_cm(θ) = (Sx_shell + Sx_inner(θ))/M, with Sx_inner of the exact form K + A cosθ + B sinθ.
 */
export function trimTheta(cfg: RobotConfig, beta: number = cfg.pose.beta): ThetaTrim {
  const c = { ...cfg, pose: { ...cfg.pose, beta } };
  const model = innerMomentModel(c);
  const shellSx = compositeOf(posedItems(c), (it) => it.mount === 'shell').moment[0];
  const f = (th: number) => shellSx + evalTrig(model.Sx, th);
  const lo = -Math.PI / 2, hi = Math.PI / 2, n = 180;
  // Scan for the sign change closest to θ = 0.
  let best: [number, number] | null = null;
  let prevT = lo, prevF = f(lo);
  for (let i = 1; i <= n; i++) {
    const t = lo + ((hi - lo) * i) / n;
    const ft = f(t);
    if (prevF === 0) best = closer(best, [prevT, prevT]);
    else if (prevF * ft < 0 || ft === 0) best = closer(best, [prevT, t]);
    prevT = t;
    prevF = ft;
  }
  if (!best) return { feasible: false, theta0: NaN, withinLimit: false };
  let [a, b] = best;
  let fa = f(a);
  for (let i = 0; i < 100 && b - a > 1e-14; i++) {
    const mid = 0.5 * (a + b);
    const fm = f(mid);
    if (fm === 0) {
      a = b = mid;
      break;
    }
    if (fa * fm < 0) b = mid;
    else {
      a = mid;
      fa = fm;
    }
  }
  const theta0 = 0.5 * (a + b);
  return { feasible: true, theta0, withinLimit: Math.abs(theta0) <= cfg.pendulum.thetaPMax + 1e-12 };
}
function closer(cur: [number, number] | null, cand: [number, number]): [number, number] {
  if (!cur) return cand;
  const d = (x: [number, number]) => Math.min(Math.abs(x[0]), Math.abs(x[1]));
  return d(cand) < d(cur) ? cand : cur;
}

/**
 * Static lean if untrimmed: the ball rolls sideways until the CoM is directly below O.
 * φ = atan2(y_cm, −z_cm); φ > 0 means the ball rolls toward +y (left). World pose = Rx(−φ).
 */
export const staticLean = (com: Vec3): number => Math.atan2(com[1], -com[2]);

/** Lean of the whole robot when the pendulum is tilted to β (other pose values from cfg). */
export function leanAtBeta(cfg: RobotConfig, beta: number): number {
  return staticLean(compositeOf(posedItems(cfg, { ...cfg.pose, beta })).com);
}

/**
 * Tilt-servo holding torque (N·m): gravity moment of the pendulum group about the tilt axis,
 * with the body leaned by φ in the world.  Returns the magnitude the servo must hold.
 * For θp = 0 and a pendulum CoM straight below the pivot this is m·g·r_p·|sin(β − φ)|.
 * (The spec writes sin(β + φ); with this tool's sign conventions — φ > 0 when the CoM is
 *  to the left, the same side as β > 0 — the lean *reduces* the torque. See docs/model.md.)
 */
export function servoTorque(cfg: RobotConfig, beta: number, phi: number, thetaP: number = cfg.pose.thetaP): number {
  const pose = { ...cfg.pose, beta, thetaP };
  const items = posedItems(cfg, pose);
  const pend = compositeOf(items, (it) => it.mount === 'pendulum');
  if (pend.mass <= 0) return 0;
  const pivot = mountPoses(cfg.architecture, pose, cfg.pendulum.pivot).pendulum.t;
  const axis = mulVec(rotY(-thetaP), [1, 0, 0]);
  const gBody = mulVec(rotX(phi), [0, 0, -cfg.drive.g]);
  const d = sub(pend.com, pivot);
  const moment = cross(d, [gBody[0] * pend.mass, gBody[1] * pend.mass, gBody[2] * pend.mass]);
  return Math.abs(dot(moment, axis));
}

export interface TrimResult {
  beta: BetaTrim;
  theta: ThetaTrim;
  /** Static lean at the current pose (rad). */
  lean: number;
  /** Remaining steering authority toward +β (left) and −β (right) from trim (rad). */
  authorityLeft: number;
  authorityRight: number;
  authorityWorst: number;
  /** Servo torque at the current β, body upright (worst case) and at the static lean (N·m). */
  servoTorqueUpright: number;
  servoTorqueLeaned: number;
  servoOverRating: boolean;
}

export function computeTrim(cfg: RobotConfig, mp: MassProps = computeMassProps(cfg)): TrimResult {
  const beta = trimBeta(cfg, mp);
  const theta = trimTheta(cfg, beta.feasible ? beta.beta0 : cfg.pose.beta);
  const lean = staticLean(mp.total.com);
  const bMax = cfg.pendulum.betaMax;
  const b0 = beta.feasible ? beta.beta0 : 0;
  const authorityLeft = beta.feasible ? bMax - b0 : 0;
  const authorityRight = beta.feasible ? bMax + b0 : 0;
  const servoTorqueUpright = servoTorque(cfg, cfg.pose.beta, 0);
  const servoTorqueLeaned = servoTorque(cfg, cfg.pose.beta, lean);
  return {
    beta,
    theta,
    lean,
    authorityLeft,
    authorityRight,
    authorityWorst: Math.max(0, Math.min(authorityLeft, authorityRight)),
    servoTorqueUpright,
    servoTorqueLeaned,
    servoOverRating: servoTorqueUpright > cfg.drive.servoRating,
  };
}
