/**
 * Mass properties of the whole robot and of its sub-assemblies (spec §4).
 * All results are in the body frame B, origin O at the shell's geometric centre.
 */
import { CompositeInertia } from './composite';
import { get, jacobiEigen, rotX, type Mat3 } from './mat3';
import { applyPose, compose, localPose, mountPoses, type MountPoses, type Pose } from './pose';
import { shapeInertia, type Shape } from './primitives';
import type { Mount, PoseConfig, RobotConfig } from './types';
import { norm, type Vec3 } from './vec';

export type ItemKind = 'shell' | 'axle' | 'frameBox' | 'bob' | 'arm' | 'payload';

/** A component reduced to what the mass-property sum needs, in its mount's frame. */
export interface LocalItem {
  id: string;
  name: string;
  kind: ItemKind;
  mount: Mount;
  shape: Shape;
  mass: number;
  included: boolean;
  /** Pose of the component in its mount frame. */
  local: Pose;
}

/** A component posed in the body frame. */
export interface PosedItem extends LocalItem {
  /** Pose in the body frame (R: local axes → body, t: CoM in body). */
  world: Pose;
  com: Vec3;
  /** Inertia about own CoM in own local axes. */
  Ilocal: Mat3;
}

export const ARM_ID = '__arm';
export const BOB_ID = '__bob';
export const SHELL_ID = '__shell';
export const AXLE_ID = '__axle';
export const FRAMEBOX_ID = '__frameBox';

/** Builds the list of every component (built-ins first, then payloads) in mount-local coordinates. */
export function localItems(cfg: RobotConfig): LocalItem[] {
  const { shell, axle, frameBox, pendulum: p } = cfg;
  const items: LocalItem[] = [
    {
      id: SHELL_ID,
      name: 'Shell',
      kind: 'shell',
      mount: 'shell',
      shape: { kind: 'hollowSphere', outerRadius: shell.outerRadius, innerRadius: Math.max(0, shell.outerRadius - shell.thickness) },
      mass: shell.mass,
      included: shell.included,
      local: localPose([0, 0, 0], [0, 0, 0]),
    },
    {
      id: AXLE_ID,
      name: 'Axle',
      kind: 'axle',
      mount: 'frame',
      shape: { kind: 'cylinder', radius: axle.radius, length: axle.length },
      mass: axle.mass,
      included: axle.included,
      // Cylinder axis is local z; rotate +90° about x so it lies along the body y axis.
      local: { R: rotX(Math.PI / 2), t: [0, 0, 0] },
    },
  ];
  if (frameBox.enabled) {
    items.push({
      id: FRAMEBOX_ID,
      name: 'Frame box',
      kind: 'frameBox',
      mount: 'frame',
      shape: { kind: 'box', size: frameBox.size },
      mass: frameBox.mass,
      included: frameBox.included,
      local: localPose(frameBox.position, frameBox.rotation),
    });
  }
  // Pendulum frame: origin at the pivot, bob hanging along −z at θp = β = 0.
  items.push({
    id: BOB_ID,
    name: 'Pendulum bob',
    kind: 'bob',
    mount: 'pendulum',
    shape: p.bobShape,
    mass: p.bobMass,
    included: p.included,
    local: localPose([0, 0, -p.armLength], p.bobRotation),
  });
  if (p.armEnabled) {
    items.push({
      id: ARM_ID,
      name: 'Pendulum arm',
      kind: 'arm',
      mount: 'pendulum',
      shape: { kind: 'rod', length: p.armLength },
      mass: p.armMass,
      included: p.included,
      local: localPose([0, 0, -p.armLength / 2], [0, 0, 0]),
    });
  }
  for (const c of cfg.payloads) {
    items.push({
      id: c.id,
      name: c.name,
      kind: 'payload',
      mount: c.mount,
      shape: c.shape,
      mass: c.mass,
      included: c.included,
      local: localPose(c.position, c.rotation),
    });
  }
  return items;
}

export function poseItems(items: LocalItem[], poses: MountPoses): PosedItem[] {
  return items.map((it) => {
    const world = compose(poses[it.mount], it.local);
    return { ...it, world, com: applyPose(world, [0, 0, 0]), Ilocal: shapeInertia(it.shape, it.mass) };
  });
}

export function posedItems(cfg: RobotConfig, pose: PoseConfig = cfg.pose): PosedItem[] {
  return poseItems(localItems(cfg), mountPoses(cfg.architecture, pose, cfg.pendulum.pivot));
}

export function compositeOf(items: PosedItem[], filter: (it: PosedItem) => boolean = () => true): CompositeInertia {
  const c = new CompositeInertia();
  for (const it of items) if (it.included && filter(it)) c.addComponent(it.world.R, it.com, it.mass, it.Ilocal);
  return c;
}

export interface Principal {
  /** Principal moments about the CoM, ascending (kg·m²). */
  moments: [number, number, number];
  /** Unit principal axes in the body frame; axes[i] belongs to moments[i]. */
  axes: [Vec3, Vec3, Vec3];
  /** Radii of gyration √(Iᵢ/M) (m). */
  gyration: [number, number, number];
}

export interface MassSummary {
  mass: number;
  com: Vec3;
  /** Σ mᵢ rᵢ (kg·m). */
  firstMoment: Vec3;
  inertiaO: Mat3;
  inertiaCom: Mat3;
}

export function summarize(c: CompositeInertia): MassSummary {
  return { mass: c.mass, com: c.com, firstMoment: c.moment, inertiaO: c.inertiaO, inertiaCom: c.inertiaCom };
}

export function principalOf(I: Mat3, mass: number): Principal {
  const { values, vectors } = jacobiEigen(I);
  const gyration = values.map((v) => (mass > 0 ? Math.sqrt(Math.max(0, v) / mass) : 0)) as [number, number, number];
  return { moments: values, axes: vectors, gyration };
}

export interface MassProps {
  items: PosedItem[];
  total: MassSummary;
  principal: Principal;
  /** |r_cm| (m) and |r_cm| / R. */
  comOffset: number;
  comOffsetRatio: number;
  /** Shell + shell-mounted parts. */
  shellGroup: MassSummary;
  /** Spin inertia of the shell group about the axle (body y through O) (kg·m²). Independent of ψ. */
  Ispin: number;
  /** Everything that does not spin with the shell: frame + frame-mounted + pendulum group. */
  inner: MassSummary;
  /** Pendulum group (bob + arm + pendulum-mounted payloads). */
  pendulum: {
    mass: number;
    /** Group CoM in the body frame at the current pose. */
    com: Vec3;
    /** Group CoM in the pendulum frame (origin at pivot). Pose-independent. */
    comLocal: Vec3;
    /** Pivot-to-CoM distance r_p (m). */
    rP: number;
  };
  /** Pivot location in the body frame at the current pose. */
  pivotWorld: Vec3;
  /** Yaw inertia of the whole robot about the vertical axis through O, at θp = β = ψ = 0 (kg·m²). */
  Iyaw: number;
}

export const ZERO_POSE: PoseConfig = { thetaP: 0, beta: 0, shellRoll: 0 };

export function computeMassProps(cfg: RobotConfig, pose: PoseConfig = cfg.pose): MassProps {
  const poses = mountPoses(cfg.architecture, pose, cfg.pendulum.pivot);
  const items = poseItems(localItems(cfg), poses);
  const totalC = compositeOf(items);
  const total = summarize(totalC);
  const shellGroup = summarize(compositeOf(items, (it) => it.mount === 'shell'));
  const inner = summarize(compositeOf(items, (it) => it.mount !== 'shell'));
  const pendC = compositeOf(items, (it) => it.mount === 'pendulum');

  // Pendulum group in its own frame (pose-independent): identity mount pose.
  const pendLocalItems = poseItems(
    localItems(cfg).filter((it) => it.mount === 'pendulum'),
    { shell: poses.shell, frame: poses.frame, pendulum: { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] } },
  );
  const pendLocal = compositeOf(pendLocalItems);

  const zeroItems = posedItems(cfg, { ...ZERO_POSE });
  const Iyaw = get(compositeOf(zeroItems).inertiaO, 2, 2);

  const R = cfg.shell.outerRadius;
  const comOffset = norm(total.com);
  return {
    items,
    total,
    principal: principalOf(total.inertiaCom, total.mass),
    comOffset,
    comOffsetRatio: R > 0 ? comOffset / R : 0,
    shellGroup,
    Ispin: get(shellGroup.inertiaO, 1, 1),
    inner,
    pendulum: { mass: pendC.mass, com: pendC.com, comLocal: pendLocal.com, rP: norm(pendLocal.com) },
    pivotWorld: applyPose(poses.pendulum, [0, 0, 0]),
    Iyaw,
  };
}

/**
 * CoM wobble over one shell revolution: the CoM traced as ψ goes 0 → 2π with everything else fixed.
 * Only shell-mounted parts move, so the wobble is zero unless they are off the axle.
 */
export function shellRollWobble(cfg: RobotConfig, samples = 72) {
  const pts: { psi: number; com: Vec3 }[] = [];
  for (let i = 0; i < samples; i++) {
    const psi = (2 * Math.PI * i) / samples;
    const c = compositeOf(posedItems(cfg, { ...cfg.pose, shellRoll: psi }));
    pts.push({ psi, com: c.com });
  }
  const range = (k: 0 | 1 | 2) => {
    const v = pts.map((p) => p.com[k]);
    return { min: Math.min(...v), max: Math.max(...v), amplitude: (Math.max(...v) - Math.min(...v)) / 2 };
  };
  return { samples: pts, x: range(0), y: range(1), z: range(2) };
}
