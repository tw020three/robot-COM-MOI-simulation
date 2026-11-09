/**
 * Time-domain playback of a steady turn: RK4 integration of the simplified dynamics of
 * Singhal et al. 2023 (arXiv:2301.06433), eqs. 20–22, plus the rolling constraints eqs. 12–13.
 *
 *   φ̈ = I_spin / I_yaw · ψ̇ θ̇                                                     (20)
 *   I_lean,c θ̈ + (I_spin + M R² − m_p r_p R) φ̇ ψ̇ + m_p r_p g (β + θ) = 0          (21)
 *   ψ̈ = 0                                                                          (22)
 *   Ẋ = R (θ̇ sinφ − ψ̇ cosφ cosθ),   Ż = R (θ̇ cosφ + ψ̇ sinφ cosθ)                  (12, 13)
 *
 * φ = heading, θ = lean, ψ = forward spin, β = pendulum tilt relative to the body (from trim),
 * I_lean,c = I_lean,O + M R² − 2 m_p r_p R (lean inertia about the contact point; paper's
 * I_p + I_h + I_y + m_p r_p² + M r_h² − 2 m_p r_p r_h). Mapping as in turning.ts.
 *
 * The paper's ground frame has X and Z horizontal (Y up). With ψ̇ < 0 the robot rolls toward +X at
 * φ = 0, so we use ψ̇ = −v/R. Assumptions (paper §3.1): β constant, small β and θ, ψ̇ constant and
 * dominant over φ̇ and θ̇, yoke CoM at the centre. Starts from θ = θ̇ = φ = φ̇ = 0 (c = 0 in eq. 23).
 */
import { rhoSinghal, wobble, type TurnParams } from './turning';

export interface PlaybackSample {
  t: number;
  /** ground position (m): x forward at t = 0, y to the left */
  x: number;
  y: number;
  /** heading φ, lean θ, spin ψ (rad) */
  phi: number;
  theta: number;
  psi: number;
}

export interface PlaybackResult {
  samples: PlaybackSample[];
  /** Closed-form eq. 29 radius (m) and wobble prediction for the same v, β. */
  rhoClosedForm: number;
  amplitude: number;
  omega: number;
  /** Radius measured from the simulation: distance travelled / heading change (m). NaN if no turn. */
  rhoSimulated: number;
  /** Centre of the mean circle (m): mean position over the last complete revolution, else predicted. */
  centre: [number, number];
  /** +1 turning left (counter-clockwise from above), −1 right. */
  turnSign: number;
}

/** Lean inertia about the contact point (kg·m²). */
export const leanInertiaContact = (p: TurnParams) => p.IleanO + p.M * p.R * p.R - 2 * p.mr * p.R;

type State = [phi: number, phiDot: number, theta: number, thetaDot: number, psi: number, X: number, Z: number];

export function simulateTurn(p: TurnParams, v: number, beta: number, opts: { duration?: number; dt?: number; maxSamples?: number } = {}): PlaybackResult {
  const psiDot = -v / p.R;
  const Ic = leanInertiaContact(p);
  const Kspin = p.Ispin + p.M * p.R * p.R - p.mr * p.R;
  const w = wobble(p, v, beta);
  const rho = rhoSinghal(p, v, beta);
  const period = Number.isFinite(w.omega) && w.omega > 0 ? (2 * Math.PI) / w.omega : 1;
  const lap = Number.isFinite(rho) && v > 0 ? (2 * Math.PI * rho) / v : 10;
  const duration = opts.duration ?? Math.min(120, Math.max(1.25 * lap, 3 * period));
  const dt = opts.dt ?? Math.min(period / 60, 0.005);
  const maxSamples = opts.maxSamples ?? 4000;

  const f = (s: State): State => {
    const [phi, phiDot, theta, thetaDot] = s;
    const phiDD = (p.Ispin / p.Iyaw) * psiDot * thetaDot;
    const thetaDD = -(Kspin * phiDot * psiDot + p.mr * p.g * (beta + theta)) / Ic;
    const Xd = p.R * (thetaDot * Math.sin(phi) - psiDot * Math.cos(phi) * Math.cos(theta));
    const Zd = p.R * (thetaDot * Math.cos(phi) + psiDot * Math.sin(phi) * Math.cos(theta));
    return [phiDot, phiDD, thetaDot, thetaDD, psiDot, Xd, Zd];
  };
  const add = (a: State, b: State, k: number) => a.map((x, i) => x + k * b[i]) as State;

  let s: State = [0, 0, 0, 0, 0, 0, 0];
  const steps = Math.ceil(duration / dt);
  const every = Math.max(1, Math.ceil(steps / maxSamples));
  // Paper frame: X forward, Z horizontal; with Y up, (X, Y, Z) right-handed ⇒ Z points to the RIGHT
  // of the direction of travel. Report y = −Z so +y is to the left (matches the body frame).
  const sample = (t: number, st: State): PlaybackSample => ({ t, x: st[5], y: -st[6], phi: st[0], theta: st[2], psi: st[4] });
  const samples: PlaybackSample[] = [sample(0, s)];
  for (let i = 1; i <= steps; i++) {
    const k1 = f(s);
    const k2 = f(add(s, k1, dt / 2));
    const k3 = f(add(s, k2, dt / 2));
    const k4 = f(add(s, k3, dt));
    s = s.map((x, j) => x + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])) as State;
    if (i % every === 0 || i === steps) samples.push(sample(i * dt, s));
  }

  // Measured radius: path length / |heading change| over the whole run.
  let len = 0;
  for (let i = 1; i < samples.length; i++) len += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  const dPhi = samples[samples.length - 1].phi - samples[0].phi;
  const rhoSimulated = Math.abs(dPhi) > 1e-9 ? len / Math.abs(dPhi) : NaN;

  // Turn direction in the ground (x, y) frame: sign of the path's mean curvature.
  let cross = 0;
  for (let i = 2; i < samples.length; i++) {
    const a = samples[i - 2], b = samples[i - 1], c = samples[i];
    cross += (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  }
  const turnSign = cross >= 0 ? 1 : -1;

  // Mean circle centre: average position over the last complete revolution if there is one.
  let centre: [number, number] = [0, turnSign * rho];
  const last = samples[samples.length - 1];
  const start = samples.findIndex((q) => Math.abs(last.phi - q.phi) <= 2 * Math.PI);
  if (Math.abs(dPhi) >= 2 * Math.PI && start > 0) {
    const seg = samples.slice(start);
    centre = [seg.reduce((a, q) => a + q.x, 0) / seg.length, seg.reduce((a, q) => a + q.y, 0) / seg.length];
  }
  return { samples, rhoClosedForm: rho, amplitude: w.amplitude, omega: w.omega, rhoSimulated, centre, turnSign };
}
