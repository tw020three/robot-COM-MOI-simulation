/**
 * Turning radius vs speed (spec §5.4).
 *
 * PRIMARY MODEL — Singhal et al. 2023, "Wobble control of a pendulum actuated spherical robot",
 * eq. 29 (https://arxiv.org/abs/2301.06433), with spin rate ψ̇ = v/R:
 *
 *   ρ(v,β) = R [ (I_spin + M R² − m_p r_p R) I_spin ψ̇² + I_yaw m_p r_p g ] / ( m_p r_p g I_spin |β| )
 *
 * Symbol mapping (UNVERIFIED — taken from the spec; the paper could not be opened from this build
 * environment): I_h → I_spin, I_h + 2I_y → I_yaw, total mass → M. β is taken as the pendulum tilt
 * measured from the trimmed (straight-rolling) tilt β₀.
 *
 * CROSS-CHECK — kinematic lean (larics/spherical_robot_model): heading rate = (v/R)·tanφ  ⇒  ρ = R / tanφ.
 */
export interface TurnParams {
  R: number;
  M: number;
  Ispin: number;
  Iyaw: number;
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
