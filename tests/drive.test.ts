import { describe, expect, it } from 'vitest';
import { acceleration, computeDrive, tauGravity } from '../src/physics/drive';
import { computeMassProps } from '../src/physics/massProps';
import { thickShellMoment } from '../src/physics/primitives';
import { computeSpeed, speedContext, steadyPitch, tauRequired } from '../src/physics/speed';
import { bareConfig } from './helpers';

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
