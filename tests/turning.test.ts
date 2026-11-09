import { describe, expect, it } from 'vitest';
import { rhoHighSpeed, rhoKinematic, rhoLowSpeed, rhoMin, rhoSinghal, tractionFloor, type TurnParams } from '../src/physics/turning';
import { computeAll } from '../src/physics/results';
import { smallDemoBot } from '../src/state/presets';

const p: TurnParams = { R: 0.1, M: 1.6, Ispin: 0.004, Iyaw: 0.006, mr: 0.05, g: 9.81 };

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
