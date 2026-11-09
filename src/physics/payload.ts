/** Payload helpers: creation, scale modes (fixed mass vs fixed density). */
import { shapeVolume, type Shape, type ShapeKind } from './primitives';
import type { Mount, PayloadComponent } from './types';
import type { Vec3 } from './vec';

export function defaultShape(kind: ShapeKind): Shape {
  switch (kind) {
    case 'point':
      return { kind: 'point' };
    case 'solidSphere':
      return { kind: 'solidSphere', radius: 0.03 };
    case 'hollowSphere':
      return { kind: 'hollowSphere', outerRadius: 0.03, innerRadius: 0.025 };
    case 'box':
      return { kind: 'box', size: [0.06, 0.04, 0.03] };
    case 'cylinder':
      return { kind: 'cylinder', radius: 0.02, length: 0.06 };
    case 'tube':
      return { kind: 'tube', outerRadius: 0.02, innerRadius: 0.015, length: 0.06 };
    case 'rod':
      return { kind: 'rod', length: 0.1 };
  }
}

let counter = 0;
export const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makePayload(
  kind: ShapeKind,
  opts: Partial<Omit<PayloadComponent, 'shape'>> & { shape?: Shape } = {},
): PayloadComponent {
  const shape = opts.shape ?? defaultShape(kind);
  const mass = opts.mass ?? 0.1;
  const vol = shapeVolume(shape);
  return {
    id: opts.id ?? newId(),
    name: opts.name ?? 'Payload',
    mount: (opts.mount ?? 'frame') as Mount,
    shape,
    mass,
    scaleMode: opts.scaleMode ?? 'fixedMass',
    density: opts.density ?? (vol > 0 ? mass / vol : 0),
    position: opts.position ?? ([0, 0, 0] as Vec3),
    rotation: opts.rotation ?? ([0, 0, 0] as Vec3),
    color: opts.color ?? '#4e79a7',
    visible: opts.visible ?? true,
    included: opts.included ?? true,
  };
}

/** Effective density ρ = m/V (kg/m³); NaN for volumeless shapes. */
export function effectiveDensity(c: PayloadComponent): number {
  const v = shapeVolume(c.shape);
  return v > 0 ? c.mass / v : NaN;
}

/**
 * Apply a new shape honouring the scale mode:
 *  fixedMass    → mass unchanged, density follows
 *  fixedDensity → mass = density × new volume
 */
export function withShape(c: PayloadComponent, shape: Shape): PayloadComponent {
  const v = shapeVolume(shape);
  if (c.scaleMode === 'fixedDensity' && v > 0) return { ...c, shape, mass: c.density * v };
  return { ...c, shape, density: v > 0 ? c.mass / v : c.density };
}

/** Uniformly scale every linear dimension by k. */
export function scaleShape(shape: Shape, k: number): Shape {
  switch (shape.kind) {
    case 'point':
      return shape;
    case 'solidSphere':
      return { ...shape, radius: shape.radius * k };
    case 'hollowSphere':
      return { ...shape, outerRadius: shape.outerRadius * k, innerRadius: shape.innerRadius * k };
    case 'box':
      return { ...shape, size: shape.size.map((s) => s * k) as Vec3 };
    case 'cylinder':
      return { ...shape, radius: shape.radius * k, length: shape.length * k };
    case 'tube':
      return { ...shape, outerRadius: shape.outerRadius * k, innerRadius: shape.innerRadius * k, length: shape.length * k };
    case 'rod':
      return { ...shape, length: shape.length * k };
  }
}

/** Set mass; in fixedDensity mode the density is updated to stay consistent. */
export function withMass(c: PayloadComponent, mass: number): PayloadComponent {
  const v = shapeVolume(c.shape);
  return { ...c, mass, density: v > 0 ? mass / v : c.density };
}
