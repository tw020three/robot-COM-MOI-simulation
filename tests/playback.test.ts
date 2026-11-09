import { describe, expect, it } from 'vitest';
import { simulateTurn } from '../src/physics/playback';
import { computeAll } from '../src/physics/results';
import { gimBall, smallDemoBot } from '../src/state/presets';

const deg = (d: number) => (d * Math.PI) / 180;

describe('playback (Singhal eqs. 20–22, RK4)', () => {
  for (const [name, make] of [['demo', smallDemoBot], ['GimBall', gimBall]] as const) {
    const p = computeAll(make()).turning.params;
    for (const v of [0.3, 1.0]) {
      it(`${name}, v = ${v} m/s: mean path radius matches eq. 29`, () => {
        const r = simulateTurn(p, v, deg(5));
        expect(Math.abs(r.rhoSimulated - r.rhoClosedForm) / r.rhoClosedForm).toBeLessThan(0.02);
      });
    }
    it(`${name}: lean oscillates as θ = A(1 − cos ωt) (eqs. 25–27)`, () => {
      const v = 0.5;
      const r = simulateTurn(p, v, deg(5), { duration: 20 });
      const th = r.samples.map((s) => s.theta);
      const mean = th.reduce((a, b) => a + b, 0) / th.length;
      expect(Math.abs(Math.abs(mean) - r.amplitude) / r.amplitude).toBeLessThan(0.05);
      expect(Math.max(...th.map(Math.abs))).toBeCloseTo(2 * r.amplitude, 3);
      // frequency from upward crossings of the mean
      const ups: number[] = [];
      for (let i = 1; i < r.samples.length; i++) if ((th[i - 1] - mean) * (th[i] - mean) < 0 && th[i] > th[i - 1]) ups.push(r.samples[i].t);
      const T = (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
      expect(Math.abs((2 * Math.PI) / T - r.omega) / r.omega).toBeLessThan(0.02);
    });
  }
  it('β > 0 (pendulum left) leans left and turns left; β = 0 rolls straight', () => {
    const p = computeAll(smallDemoBot()).turning.params;
    const left = simulateTurn(p, 0.5, deg(5));
    expect(left.turnSign).toBe(1);
    expect(left.samples[left.samples.length - 1].phi).toBeGreaterThan(0);
    expect(simulateTurn(p, 0.5, deg(-5)).turnSign).toBe(-1);
    const straight = simulateTurn(p, 0.5, 0, { duration: 5 });
    expect(Number.isNaN(straight.rhoSimulated)).toBe(true);
    const end = straight.samples[straight.samples.length - 1];
    expect(end.x).toBeCloseTo(2.5, 6);
    expect(Math.abs(end.y)).toBeLessThan(1e-12);
  });
});
