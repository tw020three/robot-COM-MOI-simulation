/**
 * Closed-form mass properties of primitive solids, about their own CoM, in their own local axes.
 * Source: Wikipedia "List of moments of inertia" (https://en.wikipedia.org/wiki/List_of_moments_of_inertia).
 *
 * Local-axis conventions:
 *  - box: edges along local x, y, z with full lengths size = [a, b, c]
 *  - cylinder / tube / rod: axis along local z, centred on the origin
 */
import { diag, type Mat3 } from './mat3';
import type { Vec3 } from './vec';

export type Shape =
  | { kind: 'point' }
  | { kind: 'solidSphere'; radius: number }
  | { kind: 'hollowSphere'; outerRadius: number; innerRadius: number }
  | { kind: 'box'; size: Vec3 }
  | { kind: 'cylinder'; radius: number; length: number }
  | { kind: 'tube'; outerRadius: number; innerRadius: number; length: number }
  | { kind: 'rod'; length: number };

export type ShapeKind = Shape['kind'];

/** Solid sphere: I = 2/5·m·r² about any axis. */
export const solidSphereInertia = (m: number, r: number): Mat3 => {
  const i = 0.4 * m * r * r;
  return diag(i, i, i);
};

/**
 * Thick spherical shell (outer R, inner r): I = 2/5·m·(R⁵ − r⁵)/(R³ − r³).
 * Limits: r = 0 → 2/5·m·R² (solid); r → R → 2/3·m·R² (thin shell, taken analytically).
 */
export function thickShellMoment(m: number, R: number, r: number): number {
  if (R <= 0) return 0;
  const ri = Math.max(0, Math.min(r, R));
  const k = ri / R;
  if (1 - k < 1e-9) return (2 / 3) * m * R * R;
  // (R⁵−r⁵)/(R³−r³) = R²·(1+k+k²+k³+k⁴)/(1+k+k²): numerically stable near k → 1.
  const ratio = (R * R * (1 + k + k * k + k ** 3 + k ** 4)) / (1 + k + k * k);
  return 0.4 * m * ratio;
}
export const thickShellInertia = (m: number, R: number, r: number): Mat3 => {
  const i = thickShellMoment(m, R, r);
  return diag(i, i, i);
};

/** Solid cuboid with full edge lengths a, b, c along x, y, z: I_xx = m/12·(b² + c²), etc. */
export const boxInertia = (m: number, [a, b, c]: Vec3): Mat3 =>
  diag((m / 12) * (b * b + c * c), (m / 12) * (a * a + c * c), (m / 12) * (a * a + b * b));

/** Solid cylinder, axis z: I_zz = ½·m·r², I_xx = I_yy = m/12·(3r² + h²). */
export const cylinderInertia = (m: number, r: number, h: number): Mat3 => {
  const t = (m / 12) * (3 * r * r + h * h);
  return diag(t, t, 0.5 * m * r * r);
};

/** Thick-walled tube, axis z: I_zz = ½·m·(r₁² + r₂²), I_xx = I_yy = m/12·(3(r₁² + r₂²) + h²). */
export const tubeInertia = (m: number, ro: number, ri: number, h: number): Mat3 => {
  const s = ro * ro + ri * ri;
  const t = (m / 12) * (3 * s + h * h);
  return diag(t, t, 0.5 * m * s);
};

/** Slender rod of length L along z, about its centre: I_xx = I_yy = m·L²/12, I_zz = 0. */
export const rodInertia = (m: number, L: number): Mat3 => {
  const t = (m * L * L) / 12;
  return diag(t, t, 0);
};

export function shapeInertia(shape: Shape, m: number): Mat3 {
  switch (shape.kind) {
    case 'point':
      return diag(0, 0, 0);
    case 'solidSphere':
      return solidSphereInertia(m, shape.radius);
    case 'hollowSphere':
      return thickShellInertia(m, shape.outerRadius, shape.innerRadius);
    case 'box':
      return boxInertia(m, shape.size);
    case 'cylinder':
      return cylinderInertia(m, shape.radius, shape.length);
    case 'tube':
      return tubeInertia(m, shape.outerRadius, shape.innerRadius, shape.length);
    case 'rod':
      return rodInertia(m, shape.length);
  }
}

/** Volume in m³ (0 for point and slender rod, which are idealised as having no volume). */
export function shapeVolume(shape: Shape): number {
  switch (shape.kind) {
    case 'point':
    case 'rod':
      return 0;
    case 'solidSphere':
      return (4 / 3) * Math.PI * shape.radius ** 3;
    case 'hollowSphere':
      return (4 / 3) * Math.PI * (shape.outerRadius ** 3 - Math.min(shape.innerRadius, shape.outerRadius) ** 3);
    case 'box':
      return shape.size[0] * shape.size[1] * shape.size[2];
    case 'cylinder':
      return Math.PI * shape.radius ** 2 * shape.length;
    case 'tube':
      return Math.PI * (shape.outerRadius ** 2 - Math.min(shape.innerRadius, shape.outerRadius) ** 2) * shape.length;
  }
}

/**
 * Points on the shape's surface (local frame) whose farthest distance from any external point
 * bounds the shape: exact for boxes (8 corners), sampled rims for cylinders. Used for geometry checks.
 */
export function shapeHullPoints(shape: Shape, rimSamples = 24): Vec3[] {
  switch (shape.kind) {
    case 'point':
      return [[0, 0, 0]];
    case 'solidSphere':
    case 'hollowSphere':
      return []; // handled analytically (centre + radius)
    case 'box': {
      const [a, b, c] = shape.size.map((s) => s / 2);
      const pts: Vec3[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx * a, sy * b, sz * c]);
      return pts;
    }
    case 'rod':
      return [
        [0, 0, -shape.length / 2],
        [0, 0, shape.length / 2],
      ];
    case 'cylinder':
    case 'tube': {
      const r = shape.kind === 'cylinder' ? shape.radius : shape.outerRadius;
      const pts: Vec3[] = [];
      for (let i = 0; i < rimSamples; i++) {
        const t = (2 * Math.PI * i) / rimSamples;
        for (const z of [-shape.length / 2, shape.length / 2]) pts.push([r * Math.cos(t), r * Math.sin(t), z]);
      }
      return pts;
    }
  }
}

/** Radius of the smallest origin-centred sphere enclosing the shape. */
export function boundingRadius(shape: Shape): number {
  switch (shape.kind) {
    case 'point':
      return 0;
    case 'solidSphere':
      return shape.radius;
    case 'hollowSphere':
      return shape.outerRadius;
    case 'box':
      return 0.5 * Math.hypot(...shape.size);
    case 'cylinder':
      return Math.hypot(shape.radius, shape.length / 2);
    case 'tube':
      return Math.hypot(shape.outerRadius, shape.length / 2);
    case 'rod':
      return shape.length / 2;
  }
}
