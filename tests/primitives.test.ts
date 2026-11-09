import { describe, expect, it } from 'vitest';
import { CompositeInertia } from '../src/physics/composite';
import { identity, isSymmetric, jacobiEigen, rotateTensor, rotZ, rotY, rotX, mul } from '../src/physics/mat3';
import { boxInertia, cylinderInertia, rodInertia, solidSphereInertia, thickShellMoment, tubeInertia } from '../src/physics/primitives';

describe('spheres', () => {
  it('solid sphere = 2/5 m R²', () => {
    expect(solidSphereInertia(3, 0.5)[0]).toBeCloseTo(0.4 * 3 * 0.25, 14);
  });
  it('thick shell reduces to the solid and thin limits', () => {
    const m = 2, R = 0.3;
    expect(thickShellMoment(m, R, 0)).toBeCloseTo(0.4 * m * R * R, 14);
    expect(thickShellMoment(m, R, R)).toBeCloseTo((2 / 3) * m * R * R, 14);
    expect(thickShellMoment(m, R, R * (1 - 1e-7))).toBeCloseTo((2 / 3) * m * R * R, 7);
    // mid value against the direct formula
    const r = 0.2;
    expect(thickShellMoment(m, R, r)).toBeCloseTo(0.4 * m * (R ** 5 - r ** 5) / (R ** 3 - r ** 3), 12);
  });
});

describe('box / cylinder (Wikipedia list of moments of inertia)', () => {
  it('cuboid', () => {
    const I = boxInertia(12, [1, 2, 3]);
    expect(I[0]).toBeCloseTo(4 + 9, 12); // m/12 (h²+d²) with m = 12
    expect(I[4]).toBeCloseTo(1 + 9, 12);
    expect(I[8]).toBeCloseTo(1 + 4, 12);
  });
  it('solid cylinder (axis z)', () => {
    const I = cylinderInertia(12, 1, 2);
    expect(I[8]).toBeCloseTo(6, 12); // ½ m r²
    expect(I[0]).toBeCloseTo(3 + 4, 12); // m/12 (3r² + h²)
  });
  it('tube and rod', () => {
    const I = tubeInertia(12, 2, 1, 2);
    expect(I[8]).toBeCloseTo(6 * 5, 12);
    expect(I[0]).toBeCloseTo(3 * 5 + 4, 12);
    expect(rodInertia(12, 2)[0]).toBeCloseTo(4, 12);
  });
  it('box rotated 45° about z gets off-diagonal (Ixx − Iyy)/2', () => {
    const I = boxInertia(12, [1, 2, 3]);
    const Ir = rotateTensor(rotZ(Math.PI / 4), I);
    expect(Ir[1]).toBeCloseTo((I[0] - I[4]) / 2, 12);
    expect(Ir[0]).toBeCloseTo((I[0] + I[4]) / 2, 12);
    expect(Ir[8]).toBeCloseTo(I[8], 12);
    expect(isSymmetric(Ir)).toBe(true);
  });
  it('tensors are symmetric positive definite and satisfy the triangle inequality', () => {
    const R = mul(mul(rotX(0.3), rotY(1.2)), rotZ(-0.8));
    for (const I of [boxInertia(2, [0.1, 0.3, 0.7]), cylinderInertia(1, 0.2, 1.5), tubeInertia(3, 0.2, 0.1, 0.05)]) {
      const Ir = rotateTensor(R, I);
      expect(isSymmetric(Ir)).toBe(true);
      const [a, b, c] = jacobiEigen(Ir).values;
      expect(a).toBeGreaterThan(0);
      expect(a + b).toBeGreaterThanOrEqual(c - 1e-12);
      expect(a + c).toBeGreaterThanOrEqual(b - 1e-12);
      expect(b + c).toBeGreaterThanOrEqual(a - 1e-12);
    }
  });
});

describe('parallel-axis theorem (LibreTexts cube about its corner)', () => {
  it('diag 2/3 m b², off-diagonal −1/4 m b²', () => {
    const m = 5, b = 0.4;
    const I = new CompositeInertia().addComponent(identity(), [b / 2, b / 2, b / 2], m, boxInertia(m, [b, b, b])).inertiaO;
    const d = (2 / 3) * m * b * b, o = -0.25 * m * b * b;
    [d, o, o, o, d, o, o, o, d].forEach((x, i) => expect(I[i]).toBeCloseTo(x, 12));
  });
  it('void components subtract (hollow cube = outer − inner)', () => {
    const c = new CompositeInertia()
      .addComponent(identity(), [0, 0, 0], 8, boxInertia(8, [2, 2, 2]))
      .addComponent(identity(), [0, 0, 0], 1, boxInertia(1, [1, 1, 1]), true);
    expect(c.mass).toBe(7);
    expect(c.inertiaO[0]).toBeCloseTo((8 / 12) * 8 - (1 / 12) * 2, 12);
  });
});
