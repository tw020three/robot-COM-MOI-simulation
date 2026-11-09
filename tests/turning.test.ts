import { describe, expect, it } from 'vitest';
import { wobble, rhoHighSpeed, rhoKinematic, rhoLowSpeed, rhoMin, rhoSinghal, tractionFloor, type TurnParams } from '../src/physics/turning';
import { computeAll } from '../src/physics/results';
import { smallDemoBot } from '../src/state/presets';

const p: TurnParams = { R: 0.1, M: 1.6, Ispin: 0.004, Iyaw: 0.006, IleanO: 0.007, mr: 0.05, g: 9.81 };

describe('Singhal eq. 29', () => {
  it('converges to the low-speed limit R I_yaw/(I_spin β)', () => {
    expect(rhoSinghal(p, 1e-6, 0.1) / rhoLowSpeed(p, 0.1)).toBeCloseTo(1, 10);
  });
  it('converges to the high-speed limit', () => {
    expect(rhoSinghal(p, 1e4, 0.1) / rhoHighSpeed(p, 1e4, 0.1)).toBeCloseTo(1, 6);
  });
  it('is exactly the sum of the two limits', () => {
    expect(rhoSinghal(p, 2, 0.1)).toBeCloseTo(rhoLowSpeed(p, 0.1) + rhoHighSpeed(p, 2, 0.1), 10);
  });
  it('ρ_min respects the traction floor', () => {
    expect(rhoMin(p, 50, 0.2, 0.01)).toBe(tractionFloor(50, 0.01, 9.81));
    expect(rhoKinematic(1, Math.PI / 4)).toBeCloseTo(1, 14);
  });
  it('computeAll produces a finite ρ_min for the demo preset', () => {
    const r = computeAll(smallDemoBot());
    expect(Number.isFinite(r.turning.rhoMinAtSpeed)).toBe(true);
    expect(r.turning.betaAvail).toBeGreaterThan(0);
  });
});

describe('wobble (eqs. 26–27)', () => {
  it('low-speed amplitude → β and frequency → √(m_p r_p g / I_lean)', () => {
    const w = wobble(p, 1e-6, 0.1);
    expect(w.amplitude).toBeCloseTo(0.1, 10);
    expect(w.omega).toBeCloseTo(Math.sqrt((0.05 * 9.81) / (0.007 + 1.6 * 0.01 - 2 * 0.05 * 0.1)), 8);
  });
  it('precession rate reproduces eq. 29: ρ = R ψ̇ / φ̇_mean', () => {
    for (const v of [0.3, 2, 8]) {
      const w = wobble(p, v, 0.12);
      expect((v / p.R) * p.R / w.precession).toBeCloseTo(rhoSinghal(p, v, 0.12), 8);
    }
  });
});
