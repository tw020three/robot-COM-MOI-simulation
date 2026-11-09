/**
 * computeAll(config) → Results: the single pure entry point the UI and sweeps use.
 */
import { geometryChecks, type GeometryWarning } from './checks';
import { computeDrive, innerMomentModel, type DriveResult } from './drive';
import { computeMassProps, shellRollWobble, type MassProps } from './massProps';
import { computeSpeed, type SpeedResult } from './speed';
import { computeTrim, leanAtBeta, servoTorque, type TrimResult } from './trim';
import { rhoKinematic, rhoMin, rhoSinghal, SMALL_ANGLE_LIMIT, tractionFloor, type TurnParams } from './turning';
import type { RobotConfig } from './types';

export interface TurningResult {
  params: TurnParams;
  /** Steering tilt available from trim, after the servo-torque cap (rad). */
  betaAvail: number;
  /** Largest tilt from trim the servo can hold with the body upright (rad). */
  betaServoLimit: number;
  betaAvailLimitedBy: 'tilt range' | 'servo torque';
  /** ρ_min at the configured current speed (m) and the model values behind it. */
  rhoMinAtSpeed: number;
  rhoModelAtSpeed: number;
  tractionAtSpeed: number;
  /** Kinematic cross-check at β_avail (m). */
  rhoKinematicAtAvail: number;
  outsideSmallAngle: boolean;
}

export interface Results {
  mass: MassProps;
  trim: TrimResult;
  drive: DriveResult;
  speed: SpeedResult;
  turning: TurningResult;
  wobble: ReturnType<typeof shellRollWobble>;
  warnings: GeometryWarning[];
}

export function turnParams(cfg: RobotConfig, mp: MassProps): TurnParams {
  return {
    R: cfg.shell.outerRadius,
    M: mp.total.mass,
    Ispin: mp.Ispin,
    Iyaw: mp.Iyaw,
    mr: mp.pendulum.mass * mp.pendulum.rP,
    g: cfg.drive.g,
  };
}

/** Largest tilt Δ ≥ 0 from β₀ (toward the worse side) the servo can hold with the body upright. */
export function servoLimitedTilt(cfg: RobotConfig, beta0: number, maxDelta: number, steps = 200): number {
  if (maxDelta <= 0) return 0;
  const rating = cfg.drive.servoRating;
  const ok = (d: number) =>
    servoTorque(cfg, beta0 + d, 0) <= rating && servoTorque(cfg, beta0 - d, 0) <= rating;
  if (ok(maxDelta)) return maxDelta;
  if (!ok(0)) return 0;
  let a = 0, b = maxDelta;
  for (let i = 0; i < steps && b - a > 1e-9; i++) {
    const m = 0.5 * (a + b);
    if (ok(m)) a = m;
    else b = m;
  }
  return a;
}

export function computeTurning(cfg: RobotConfig, mp: MassProps, trim: TrimResult): TurningResult {
  const params = turnParams(cfg, mp);
  const beta0 = trim.beta.feasible ? trim.beta.beta0 : 0;
  const authority = trim.authorityWorst;
  const betaServoLimit = servoLimitedTilt(cfg, beta0, authority);
  const betaAvail = Math.min(authority, betaServoLimit);
  const v = cfg.drive.speed;
  const rhoModelAtSpeed = rhoSinghal(params, v, betaAvail);
  const tractionAtSpeed = tractionFloor(v, cfg.drive.mu, cfg.drive.g);
  const phi = leanAtBeta(cfg, beta0 + betaAvail);
  return {
    params,
    betaAvail,
    betaServoLimit,
    betaAvailLimitedBy: betaServoLimit < authority ? 'servo torque' : 'tilt range',
    rhoMinAtSpeed: rhoMin(params, v, betaAvail, cfg.drive.mu),
    rhoModelAtSpeed,
    tractionAtSpeed,
    rhoKinematicAtAvail: rhoKinematic(cfg.shell.outerRadius, phi),
    outsideSmallAngle: betaAvail > SMALL_ANGLE_LIMIT,
  };
}

export function computeAll(cfg: RobotConfig, opts: { checks?: boolean; wobble?: boolean } = {}): Results {
  const mass = computeMassProps(cfg);
  const model = innerMomentModel(cfg);
  const trim = computeTrim(cfg, mass);
  const drive = computeDrive(cfg, mass, model);
  const speed = computeSpeed(cfg, mass);
  const turning = computeTurning(cfg, mass, trim);
  const wobble = opts.wobble === false ? shellRollWobble(cfg, 1) : shellRollWobble(cfg);
  const warnings = opts.checks === false ? [] : geometryChecks(cfg);
  return { mass, trim, drive, speed, turning, wobble, warnings };
}
