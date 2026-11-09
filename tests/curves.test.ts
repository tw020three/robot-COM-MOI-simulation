import { describe, expect, it } from 'vitest';
import { pitchTable, sweepTable, toCSV, torqueTable, turningTable } from '../src/physics/curves';
import { computeAll } from '../src/physics/results';
import { runSweep } from '../src/physics/sweep';
import { rhoSinghal } from '../src/physics/turning';
import { smallDemoBot } from '../src/state/presets';

describe('chart tables', () => {
  const cfg = smallDemoBot();
  const r = computeAll(cfg);
  it('turning: ρ_min = max(model, traction) and matches eq. 29 pointwise', () => {
    const t = turningTable(cfg, r, 40);
    expect(t.rows).toHaveLength(40);
    for (const row of t.rows) {
      expect(row.rho_min).toBe(Math.max(row.rho_avail, row.traction));
      expect(row.rho_b10).toBeCloseTo(rhoSinghal(r.turning.params, row.v, (10 * Math.PI) / 180), 12);
    }
    expect(t.rows[t.rows.length - 1].v).toBeGreaterThan(r.speed.vMax);
  });
  it('torque: available ≥ required up to v_max and below after', () => {
    const t = torqueTable(cfg, r, 200);
    for (const row of t.rows) {
      if (row.v < r.speed.vMax * 0.99) expect(row.available).toBeGreaterThanOrEqual(row.required);
      if (row.v > r.speed.vMax * 1.01) expect(row.available).toBeLessThan(row.required);
    }
  });
  it('pitch: τ_g peaks near 90° for a pendulum below O', () => {
    const t = pitchTable(cfg, r, 181);
    const best = t.rows.reduce((a, b) => (b.tauG > a.tauG ? b : a));
    expect(Math.abs(best.thetaP - Math.PI / 2)).toBeLessThan(0.05);
  });
  it('sweep table and CSV', () => {
    const rows = runSweep(cfg, 'Battery.position.y', -0.02, 0.02, 5);
    const t = sweepTable(rows, 'Battery.position.y', 'm', cfg.pendulum.betaMax);
    expect(t.rows[2].y).toBeLessThan(t.rows[4].y);
    const csv = toCSV(t);
    expect(csv.split('\n')[0]).toBe('Battery.position.y [m],trim tilt β₀ [rad],β_max [rad],CoM x [m],CoM y [m],CoM z [m],|CoM offset| [m],principal I₁ [kg·m²],principal I₂ [kg·m²],principal I₃ [kg·m²]');
    expect(csv.trim().split('\n')).toHaveLength(6);
  });
});
