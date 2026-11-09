import { describe, expect, it } from 'vitest';
import { makePayload } from '../src/physics/payload';
import { computeTrim, servoTorque, staticLean, trimBeta, trimTheta } from '../src/physics/trim';
import { computeMassProps } from '../src/physics/massProps';
import { bareConfig } from './helpers';

const pt = (m: number, position: [number, number, number]) => makePayload('point', { id: 'b', name: 'b', mass: m, position, mount: 'frame' });

describe('β₀ lateral trim', () => {
  it('payload m_b at y = d gives β₀ = asin(−m_b d/(m_p r_p))', () => {
    const mp = 2, rp = 0.1, mb = 0.3, d = 0.05;
    const c = bareConfig({ mp, rp });
    c.payloads = [pt(mb, [0, d, -0.02])];
    const t = trimBeta(c);
    expect(t.feasible).toBe(true);
    expect(t.beta0).toBeCloseTo(Math.asin((-mb * d) / (mp * rp)), 14);
    // and the trimmed CoM really is on the mid-plane
    c.pose.beta = t.beta0;
    expect(computeMassProps(c).total.com[1]).toBeCloseTo(0, 14);
  });
  it('includes the pivot offset y_piv', () => {
    const c = bareConfig({ mp: 2, rp: 0.1 });
    c.pendulum.pivot = [0, 0.01, 0];
    c.payloads = [pt(0.3, [0, 0.05, 0])];
    expect(trimBeta(c).beta0).toBeCloseTo(Math.asin(-(0.3 * 0.05 + 2 * 0.01) / (2 * 0.1)), 14);
  });
  it('flags an unreachable case', () => {
    const c = bareConfig({ mp: 1, rp: 0.05 });
    c.payloads = [pt(2, [0, 0.1, 0])];
    const t = trimBeta(c);
    expect(t.feasible).toBe(false);
    expect(Math.abs(t.arg)).toBeGreaterThan(1);
    expect(Number.isNaN(t.beta0)).toBe(true);
  });
});

describe('θ₀ fore/aft trim (bisection)', () => {
  it('architecture B matches the closed form asin(−m_b d/(m_p r_p))', () => {
    const c = bareConfig({ mp: 2, rp: 0.1, arch: 'B' });
    c.payloads = [pt(0.4, [0.03, 0, 0])];
    expect(trimTheta(c).theta0).toBeCloseTo(Math.asin((-0.4 * 0.03) / (2 * 0.1)), 12);
  });
  it('architecture A: frame payload pitches too → tanθ₀ = −m_b d/(m_p r_p)', () => {
    const c = bareConfig({ mp: 2, rp: 0.1, arch: 'A' });
    c.payloads = [pt(0.4, [0.03, 0, 0])];
    expect(trimTheta(c).theta0).toBeCloseTo(Math.atan((-0.4 * 0.03) / (2 * 0.1)), 12);
  });
});

describe('lean and servo torque', () => {
  it('static lean φ = atan2(y_cm, −z_cm)', () => {
    expect(staticLean([0, 0.01, -0.01])).toBeCloseTo(Math.PI / 4, 15);
    expect(staticLean([0, -0.01, -0.01])).toBeCloseTo(-Math.PI / 4, 15);
  });
  it('servo torque = m_p g r_p |sin(β − φ)| at θp = 0', () => {
    const c = bareConfig({ mp: 2, rp: 0.1 });
    for (const [b, phi] of [[0.2, 0], [0.3, 0.1], [-0.2, 0.15]]) {
      expect(servoTorque(c, b, phi)).toBeCloseTo(2 * 9.81 * 0.1 * Math.abs(Math.sin(b - phi)), 12);
    }
  });
  it('steering authority is β_max ∓ β₀', () => {
    const c = bareConfig({ mp: 2, rp: 0.1 });
    c.payloads = [pt(0.3, [0, 0.05, 0])];
    const t = computeTrim(c);
    expect(t.authorityLeft).toBeCloseTo(c.pendulum.betaMax - t.beta.beta0, 14);
    expect(t.authorityRight).toBeCloseTo(c.pendulum.betaMax + t.beta.beta0, 14);
    expect(t.authorityWorst).toBeCloseTo(Math.min(t.authorityLeft, t.authorityRight), 14);
  });
});
