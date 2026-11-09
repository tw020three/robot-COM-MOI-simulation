/**
 * 3×3 matrices stored row-major as a flat 9-element array:
 *   [m00 m01 m02 m10 m11 m12 m20 m21 m22]
 * Includes rotation builders and a cyclic Jacobi eigen-solver for symmetric matrices.
 */
import type { Vec3 } from './vec';

export type Mat3 = number[];

export const identity = (): Mat3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const zeros = (): Mat3 => [0, 0, 0, 0, 0, 0, 0, 0, 0];
export const diag = (a: number, b: number, c: number): Mat3 => [a, 0, 0, 0, b, 0, 0, 0, c];
export const get = (m: Mat3, r: number, c: number): number => m[r * 3 + c];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const out = zeros();
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return out;
}

export const mulVec = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const addM = (a: Mat3, b: Mat3): Mat3 => a.map((x, i) => x + b[i]);
export const subM = (a: Mat3, b: Mat3): Mat3 => a.map((x, i) => x - b[i]);
export const scaleM = (a: Mat3, s: number): Mat3 => a.map((x) => x * s);
export const trace = (m: Mat3): number => m[0] + m[4] + m[8];
export const det = (m: Mat3): number =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);

/** Rotation R·I·Rᵀ of a tensor expressed in a rotated frame back into the parent frame. */
export const rotateTensor = (R: Mat3, I: Mat3): Mat3 => mul(mul(R, I), transpose(R));

/** Right-handed rotations about the coordinate axes (positive = counter-clockwise looking down the axis). */
export function rotX(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export function rotY(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
export function rotZ(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** Intrinsic XYZ Euler (radians), identical to three.js Euler order 'XYZ': R = Rx·Ry·Rz. */
export const fromEulerXYZ = (e: Vec3): Mat3 => mul(mul(rotX(e[0]), rotY(e[1])), rotZ(e[2]));

/**
 * Point-mass "parallel-axis" term m·(|r|²E − r rᵀ): the inertia of mass m at offset r.
 * Off-diagonals carry the minus sign (I_xy = −m·x·y).
 */
export function pointInertia(m: number, r: Vec3): Mat3 {
  const [x, y, z] = r;
  return [
    m * (y * y + z * z), -m * x * y, -m * x * z,
    -m * x * y, m * (x * x + z * z), -m * y * z,
    -m * x * z, -m * y * z, m * (x * x + y * y),
  ];
}

export function isSymmetric(m: Mat3, tol = 1e-9): boolean {
  const scaleRef = Math.max(1e-30, ...m.map(Math.abs));
  return (
    Math.abs(m[1] - m[3]) <= tol * scaleRef &&
    Math.abs(m[2] - m[6]) <= tol * scaleRef &&
    Math.abs(m[5] - m[7]) <= tol * scaleRef
  );
}

export interface Eigen {
  /** Eigenvalues sorted ascending. */
  values: [number, number, number];
  /** Unit eigenvectors; vectors[i] belongs to values[i]. Right-handed set. */
  vectors: [Vec3, Vec3, Vec3];
}

/**
 * Cyclic Jacobi eigen-decomposition of a symmetric 3×3 matrix.
 * Converges quadratically; 50 sweeps is far more than ever needed for 3×3.
 */
export function jacobiEigen(input: Mat3, maxSweeps = 50): Eigen {
  const a = [
    [input[0], input[1], input[2]],
    [input[3], input[4], input[5]],
    [input[6], input[7], input[8]],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const scaleRef = Math.max(1e-300, Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]));
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off <= 1e-15 * scaleRef) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  const values = idx.map((i) => a[i][i]) as [number, number, number];
  const vectors = idx.map((i) => [v[0][i], v[1][i], v[2][i]] as Vec3) as [Vec3, Vec3, Vec3];
  // Make the set right-handed: e3 = e1 × e2.
  const [e1, e2, e3] = vectors;
  const c3: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (c3[0] * e3[0] + c3[1] * e3[1] + c3[2] * e3[2] < 0) vectors[2] = [-e3[0], -e3[1], -e3[2]];
  return { values, vectors };
}
