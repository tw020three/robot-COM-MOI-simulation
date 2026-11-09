import { describe, expect, it } from 'vitest';
import { fromEulerXYZ, isSymmetric, jacobiEigen, mul, mulVec, rotX, rotY, rotZ, rotateTensor, transpose, type Mat3 } from '../src/physics/mat3';

const close = (a: number[], b: number[], tol = 1e-12) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], -Math.log10(tol)));

describe('rotations', () => {
  it('are right-handed', () => {
    close(mulVec(rotZ(Math.PI / 2), [1, 0, 0]), [0, 1, 0]);
    close(mulVec(rotX(Math.PI / 2), [0, 1, 0]), [0, 0, 1]);
    close(mulVec(rotY(Math.PI / 2), [0, 0, 1]), [1, 0, 0]);
  });
  it('XYZ Euler = Rx·Ry·Rz (three.js order)', () => {
    const e: [number, number, number] = [0.3, -0.7, 1.1];
    close(fromEulerXYZ(e), mul(mul(rotX(e[0]), rotY(e[1])), rotZ(e[2])));
  });
});

describe('Jacobi eigen-solver', () => {
  it('diagonalises a random symmetric matrix and reconstructs it', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let trial = 0; trial < 50; trial++) {
      const a = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
      const A: Mat3 = [a[0], a[3], a[4], a[3], a[1], a[5], a[4], a[5], a[2]];
      const { values, vectors } = jacobiEigen(A);
      expect(values[0]).toBeLessThanOrEqual(values[1]);
      expect(values[1]).toBeLessThanOrEqual(values[2]);
      const V: Mat3 = [vectors[0][0], vectors[1][0], vectors[2][0], vectors[0][1], vectors[1][1], vectors[2][1], vectors[0][2], vectors[1][2], vectors[2][2]];
      const D: Mat3 = [values[0], 0, 0, 0, values[1], 0, 0, 0, values[2]];
      close(mul(mul(V, D), transpose(V)), A, 1e-10);
      close(mul(transpose(V), V), [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-10);
    }
  });
  it('handles an already-diagonal and a degenerate matrix', () => {
    expect(jacobiEigen([3, 0, 0, 0, 1, 0, 0, 0, 2]).values).toEqual([1, 2, 3]);
    const r = jacobiEigen(rotateTensor(rotZ(0.4), [2, 0, 0, 0, 2, 0, 0, 0, 5]));
    close(r.values, [2, 2, 5], 1e-12);
  });
  it('rotated tensors stay symmetric', () => {
    expect(isSymmetric(rotateTensor(fromEulerXYZ([0.2, 0.5, -1]), [1, 0, 0, 0, 2, 0, 0, 0, 3]))).toBe(true);
  });
});
