/**
 * Rigid poses (rotation + translation) and the mount poses of the three mount types.
 *
 * Sign conventions (body frame: x forward, y left, z up; right-handed rotations):
 *  - Pendulum pitch θp > 0 swings the bob forward (+x):   rotation Ry(−θp)
 *  - Pendulum tilt  β  > 0 swings the bob left (+y):      rotation Rx(+β), applied after (inside) the pitch
 *  - Shell roll     ψ  > 0 is forward rolling:            rotation Ry(+ψ)
 *
 * Architecture A: frame pose = Ry(−θp) about O; pendulum pose = frame ∘ T(pivot) ∘ Rx(β)
 * Architecture B: frame pose = identity;       pendulum pose = T(pivot) ∘ Ry(−θp) ∘ Rx(β)
 * Both give the pendulum the same orientation Ry(−θp)·Rx(β); only the pivot location differs.
 */
import { fromEulerXYZ, identity, mul, mulVec, rotX, rotY, type Mat3 } from './mat3';
import type { Architecture, Mount, PoseConfig } from './types';
import { add, type Vec3 } from './vec';

export interface Pose {
  R: Mat3;
  t: Vec3;
}

export const poseIdentity = (): Pose => ({ R: identity(), t: [0, 0, 0] });
export const poseFrom = (R: Mat3, t: Vec3 = [0, 0, 0]): Pose => ({ R, t });
/** a ∘ b: first apply b, then a. */
export const compose = (a: Pose, b: Pose): Pose => ({ R: mul(a.R, b.R), t: add(mulVec(a.R, b.t), a.t) });
export const applyPose = (p: Pose, x: Vec3): Vec3 => add(mulVec(p.R, x), p.t);
/** Local pose of a component from its position and XYZ-Euler rotation. */
export const localPose = (position: Vec3, rotation: Vec3): Pose => ({ R: fromEulerXYZ(rotation), t: [...position] as Vec3 });

export interface MountPoses {
  shell: Pose;
  frame: Pose;
  pendulum: Pose;
}

export function mountPoses(arch: Architecture, pose: PoseConfig, pivot: Vec3): MountPoses {
  const shell = poseFrom(rotY(pose.shellRoll));
  const pitch = rotY(-pose.thetaP);
  const tilt = rotX(pose.beta);
  if (arch === 'A') {
    const frame = poseFrom(pitch);
    const pendulum = compose(frame, poseFrom(tilt, pivot));
    return { shell, frame, pendulum };
  }
  const frame = poseIdentity();
  const pendulum = poseFrom(mul(pitch, tilt), pivot);
  return { shell, frame, pendulum };
}

export const mountPose = (poses: MountPoses, mount: Mount): Pose => poses[mount];
