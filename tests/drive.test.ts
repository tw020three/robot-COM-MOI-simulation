import { describe, expect, it } from 'vitest';
import { acceleration, computeDrive, tauGravity } from '../src/physics/drive';
import { computeMassProps } from '../src/physics/massProps';
import { thickShellMoment } from '../src/physics/primitives';
import { computeSpeed, speedContext, steadyPitch, tauRequired } from '../src/physics/speed';
import { bareConfig } from './helpers';
import { makePayload } from '../src/physics/payload';

const g = 9.81;

describe('drive torque', () => {
  it('τ_g at θp = 90° equals m_p g r_p (and m_p g r_p sinθ in general)', () => {
    const c = bareConfig({ mp: 2, rp: 0.1 });
    expect(tauGravity(c, Math.PI / 2)).toBeCloseTo(2 * g * 0.1, 12);
    expect(tauGravity(c, 0.4)).toBeCloseTo(2 * g * 0.1 * Math.sin(0.4), 12);
  });
  it('slope limit = asin(m_p r_p/(M R)) for a pendulum-only inner mass', () => {
    const c = bareConfig({ mp: 2, rp: 0.1, R: 0.2 });
    c.shell.mass = 3;
    const d = computeDrive(c);
    expect(d.binding).toBe('pendulum gravity');
    expect(d.maxSlope).toBeCloseTo(Math.asin((2 * 0.1) / (5 * 0.2)), 12);
    const e = (2 * 0.1) / 5;
    expect(d.maxStep).toBeCloseTo(0.2 - Math.sqrt(0.04 - e * e), 12);
  });
  it('reports the binding constraint', () => {
    const c = bareConfig({ mp: 2, rp: 0.1 });
    c.drive.stallTorque = 0.5;
    c.drive.gearRatio = 1;
    expect(computeDrive(c).binding).toBe('motor stall');
    c.drive.stallTorque = 1e6;
    c.drive.mu = 0.01;
    expect(computeDrive(c).binding).toBe('traction');
  });
  it('acceleration matches the spec formula for a pendulum pivoted at O', () => {
    const c = bareConfig({ mp: 2, rp: 0.1, R: 0.2 });
    c.shell.mass = 3;
    const Is = thickShellMoment(3, 0.2, 0.198);
    const th = 0.5;
    const expected = (2 * g * 0.1 * Math.sin(th)) / ((5 + Is / 0.04) * 0.2 - 2 * 0.1 * Math.cos(th));
    expect(acceleration(c, th)).toBeCloseTo(expected, 12);
    // architecture A with a frame mass gives the same answer as replacing m_p r_p by the inner first moment
    const cA = { ...c, architecture: 'A' as const };
    expect(acceleration(cA, th)).toBeCloseTo(expected, 12);
  });
});

describe('max speed', () => {
  it('motor-limited case matches the closed form', () => {
    const c = bareConfig({ mp: 2, rp: 0.1, R: 0.2 });
    c.drive = { ...c.drive, crr: 0.02, gearRatio: 10, stallTorque: 0.1, noLoadSpeed: 500 };
    const M = 2, R = 0.2;
    const tauReq = R * 0.02 * M * g;
    const vExpected = (1 - tauReq / (10 * 0.1)) * (R * 500) / 10;
    const s = computeSpeed(c);
    expect(s.binding).toBe('motor torque');
    expect(s.vMax).toBeCloseTo(vExpected, 9);
  });
  it('steady pitch = asin(τ_req/(m_p g r_p))', () => {
    const c = bareConfig({ mp: 2, rp: 0.1 });
    c.drive.crr = 0.05;
    const ctx = speedContext(c, computeMassProps(c));
    const req = tauRequired(ctx, 0);
    expect(steadyPitch(ctx, req)).toBeCloseTo(Math.asin(req / (2 * g * 0.1)), 12);
  });
  it('flags "cannot move" when resistance exceeds the drive', () => {
    const c = bareConfig({ mp: 0.1, rp: 0.01 });
    c.drive.crr = 0.5;
    c.pendulum.thetaPMax = 0.1;
    expect(computeSpeed(c).binding).toBe('cannot move');
  });
});

describe('published reference values (Ylikorpi et al. 2014)', () => {
  it('GimBall quasi-static max step height = 0.0018936 m (obstacle paper, Fig. 5/6)', async () => {
    const { gimBall } = await import('../src/state/presets');
    const c = gimBall();
    const mp = computeMassProps(c);
    expect(mp.total.mass).toBeCloseTo(5.39, 12);
    expect(mp.Ispin).toBeCloseTo(0.0778, 10); // ball inertia J₁
    const d = computeDrive(c);
    expect(d.binding).toBe('pendulum gravity');
    // published 0.0018936 m; the paper's rounded inputs give 0.0018946 m (0.05 % apart)
    expect(Math.abs(d.maxStep - 0.0018936) / 0.0018936).toBeLessThan(1e-3);
  });
  it('acceleration matches the unified Lagrangian model (eqs. 3–4) with the pendulum held at a fixed angle', () => {
    // GimBall values from the unified-model paper: M1 = 3.294, M2 = 1.795, R = 0.226, e = 0.065, J1 = 0.0633
    const M1 = 3.294, M2 = 1.795, R = 0.226, e = 0.065, J1 = 0.0633;
    // J1 is below 2/5·M1·R² (a solid sphere of mass M1), so M1 is not a uniform shell: it includes internals
    // near the centre. Model it as a thin shell carrying J1 plus the rest of M1 as a frame point mass at O.
    const c = bareConfig({ mp: M2, rp: e, R });
    const mShell = J1 / ((2 / 3) * R * R);
    c.shell.mass = mShell;
    c.shell.thickness = 0;
    c.payloads = [makePayload('point', { id: 'core', name: 'core', mass: M1 - mShell, position: [0, 0, 0], mount: 'frame' })];
    expect(computeMassProps(c).Ispin).toBeCloseTo(J1, 12);
    for (const phi of [0.2, 0.6, 1.2]) {
      // Lagrangian x- and φ-equations with φ̈ = φ̇ = 0 (absolute pendulum angle φ, generalised forces τ/R and τ):
      //   (M1 + J1/R² + M2) ẍ = τ/R ,   τ = M2 e (ẍ cosφ + g sinφ)
      const xdd = (M2 * e * g * Math.sin(phi)) / ((M1 + J1 / (R * R) + M2) * R - M2 * e * Math.cos(phi));
      expect(acceleration(c, phi)).toBeCloseTo(xdd, 10);
    }
  });
});
