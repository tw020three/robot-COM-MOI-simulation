/**
 * Turning radius vs speed (spec §5.4).
 *
 * PRIMARY MODEL — Singhal et al. 2023, "Wobble control of a pendulum actuated spherical robot",
 * eq. 29 (https://arxiv.org/abs/2301.06433), with spin rate ψ̇ = v/R:
 *
 *   ρ(v,β) = R [ (I_spin + M R² − m_p r_p R) I_spin ψ̇² + I_yaw m_p r_p g ] / ( m_p r_p g I_spin |β| )
 *
 * Symbol mapping (verified against the paper, §2.2 and eq. 9): the paper's hull inertia I_h (isotropic
 * hull, spins with ψ) → I_spin; the yoke inertia diag(I_y, 2I_y, I_y) with 2I_y about the vertical, so
 * I_h + 2I_y = yaw inertia of hull + yoke (the pendulum lies on the vertical axis at β = 0) → I_yaw;
 * (m_p + m_y + m_h) → M; r_h → R. β is the pendulum angle relative to the yoke (body), here measured
 * from the trimmed tilt β₀. The paper places the pivot at O and assumes the yoke CoM at O (r_y = 0);
 * frame-mounted mass offsets are therefore outside the model. The paper's sign (ρ < 0 for β > 0) only
 * encodes turn direction; magnitudes are used here.
 *
 * CROSS-CHECK — kinematic lean (larics/spherical_robot_model): heading rate = (v/R)·tanφ  ⇒  ρ = R / tanφ.
 */
export interface TurnParams {
  R: number;
  M: number;
  Ispin: number;
  Iyaw: number;
  /** Lean inertia about the forward axis through O (kg·m²): paper's I_p + I_h + I_y + m_p r_p². */
  IleanO: number;
  /** Pendulum first moment m_p·r_p (kg·m). */
  mr: number;
  g: number;
}

export function rhoSinghal(p: TurnParams, v: number, beta: number): number {
  const b = Math.abs(beta);
  if (b === 0 || p.mr <= 0 || p.Ispin <= 0) return Infinity;
  const psiDot = v / p.R;
  const num = p.R * ((p.Ispin + p.M * p.R * p.R - p.mr * p.R) * p.Ispin * psiDot * psiDot + p.Iyaw * p.mr * p.g);
  return num / (p.mr * p.g * p.Ispin * b);
}

/** Low-speed limit: ρ → R·I_yaw / (I_spin·β). */
export const rhoLowSpeed = (p: TurnParams, beta: number) => (p.R * p.Iyaw) / (p.Ispin * Math.abs(beta));

/** High-speed limit: ρ → (I_spin + M R² − m_p r_p R)·v² / (m_p r_p g β R). */
export const rhoHighSpeed = (p: TurnParams, v: number, beta: number) =>
  ((p.Ispin + p.M * p.R * p.R - p.mr * p.R) * v * v) / (p.mr * p.g * Math.abs(beta) * p.R);

/** Kinematic-lean cross-check: ρ = R / tan|φ|. */
export const rhoKinematic = (R: number, phi: number) => {
  const t = Math.tan(Math.abs(phi));
  return t > 0 ? R / t : Infinity;
};

/** Traction floor: lateral acceleration v²/ρ ≤ μ g  ⇒  ρ ≥ v²/(μ g). */
export const tractionFloor = (v: number, mu: number, g: number) => (mu > 0 ? (v * v) / (mu * g) : Infinity);

/** ρ_min(v) = max(ρ(v, β_avail), v²/(μ g)). */
export const rhoMin = (p: TurnParams, v: number, betaAvail: number, mu: number) =>
  Math.max(rhoSinghal(p, v, betaAvail), tractionFloor(v, mu, p.g));

/** Above this tilt the small-angle turning model is outside its validity range (rad). */
export const SMALL_ANGLE_LIMIT = (15 * Math.PI) / 180;

/**
 * Wobble (Singhal et al. 2023, eqs. 24–27). Lean θ(t) = A(1 − cos ωt) about the forward axis.
 *   K   = I_spin(I_spin + M R² − m_p r_p R)/I_yaw · ψ̇² + m_p r_p g
 *   |A| = m_p r_p g β / K                       (mean lean = A; A → β at low speed)
 *   ω   = √( K / (I_lean,O + M R² − 2 m_p r_p R) )   (rad/s; the denominator is the lean inertia about the contact point)
 * Precession (eq. 23): φ̇_mean = I_spin/I_yaw · ψ̇ · A, so ρ = R ψ̇ / φ̇_mean reproduces eq. 29.
 */
export function wobble(p: TurnParams, v: number, beta: number) {
  const psiDot = v / p.R;
  const K = (p.Ispin * (p.Ispin + p.M * p.R * p.R - p.mr * p.R) / p.Iyaw) * psiDot * psiDot + p.mr * p.g;
  const Ilean = p.IleanO + p.M * p.R * p.R - 2 * p.mr * p.R;
  const amplitude = K > 0 ? (p.mr * p.g * Math.abs(beta)) / K : NaN;
  const omega = K > 0 && Ilean > 0 ? Math.sqrt(K / Ilean) : NaN;
  const precession = p.Iyaw > 0 ? (p.Ispin / p.Iyaw) * psiDot * amplitude : NaN;
  return { amplitude, omega, frequencyHz: omega / (2 * Math.PI), precession };
}
