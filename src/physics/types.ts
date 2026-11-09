/**
 * RobotConfig: the single source of truth. Every output is a pure function of it.
 * SI units throughout (m, kg, s, rad). The UI converts angles to degrees for display.
 */
import type { Shape } from './primitives';
import type { Vec3 } from './vec';

export type Mount = 'shell' | 'frame' | 'pendulum';

/**
 * (A) the whole internal assembly (frame + pendulum) pitches with θp about the axle;
 * (B) only the pendulum pitches, the frame stays level.
 */
export type Architecture = 'A' | 'B';

export type ScaleMode = 'fixedMass' | 'fixedDensity';

export interface Appearance {
  color: string;
  visible: boolean;
  /** "include in calculations" toggle. */
  included: boolean;
}

/** A user payload object. Position/rotation are expressed in its mount's frame. */
export interface PayloadComponent extends Appearance {
  id: string;
  name: string;
  mount: Mount;
  shape: Shape;
  /** kg. In fixedDensity mode this is kept equal to density × volume. */
  mass: number;
  scaleMode: ScaleMode;
  /** kg/m³. Used when scaleMode = 'fixedDensity'; otherwise informational. */
  density: number;
  /** m, in the mount frame (shell frame / frame frame / pendulum frame with origin at the pivot). */
  position: Vec3;
  /** rad, intrinsic XYZ Euler (three.js order 'XYZ'). */
  rotation: Vec3;
}

export interface ShellConfig extends Appearance {
  outerRadius: number; // R (m)
  thickness: number; // t (m)
  mass: number; // kg
}

/** Axle: solid cylinder along body y through O, frame-mounted. */
export interface AxleConfig extends Appearance {
  mass: number;
  radius: number;
  length: number;
}

/** Optional box carried by the yoke/frame. */
export interface FrameBoxConfig extends Appearance {
  enabled: boolean;
  mass: number;
  size: Vec3;
  position: Vec3; // frame frame
  rotation: Vec3;
}

export type BobShape =
  | { kind: 'point' }
  | { kind: 'solidSphere'; radius: number }
  | { kind: 'box'; size: Vec3 }
  | { kind: 'cylinder'; radius: number; length: number };

export interface PendulumConfig extends Appearance {
  /** Fixed bob mass m_p (kg), set once by the user. */
  bobMass: number;
  bobShape: BobShape;
  bobRotation: Vec3;
  /** Optional slender arm from the pivot to the bob CoM, with its own mass. */
  armEnabled: boolean;
  armMass: number;
  /** Pivot location in the frame frame (x is normally 0; y and z are the user offsets). */
  pivot: Vec3;
  /** Arm length l: pivot to bob CoM (m). */
  armLength: number;
  thetaPMax: number; // rad
  betaMax: number; // rad
}

export interface PoseConfig {
  /** Pendulum fore/aft pitch θp (rad); positive swings the bob forward (+x). */
  thetaP: number;
  /** Pendulum lateral tilt β (rad); positive swings the bob left (+y). */
  beta: number;
  /** Shell roll angle ψ about +y (rad); positive = forward rolling. */
  shellRoll: number;
}

export interface DriveConfig {
  gearRatio: number; // N (motor turns per shell turn relative to the axle)
  stallTorque: number; // motor stall torque τ_stall (N·m, motor side)
  noLoadSpeed: number; // motor no-load speed ω_noload (rad/s, motor side)
  mu: number; // ground friction coefficient
  crr: number; // rolling-resistance coefficient
  cd: number; // drag coefficient
  /** Frontal area (m²); null → πR². */
  frontalArea: number | null;
  rhoAir: number; // kg/m³
  slope: number; // α (rad), for the speed calculation
  servoRating: number; // tilt-servo rated torque (N·m)
  /** Speed at which "current" readouts (ρ_min) are evaluated (m/s). */
  speed: number;
  g: number; // m/s²
}

export interface RobotConfig {
  version: 1;
  name: string;
  architecture: Architecture;
  shell: ShellConfig;
  axle: AxleConfig;
  frameBox: FrameBoxConfig;
  pendulum: PendulumConfig;
  pose: PoseConfig;
  drive: DriveConfig;
  payloads: PayloadComponent[];
}
