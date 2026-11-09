import { describe, expect, it } from 'vitest';
import { geometryChecks } from '../src/physics/checks';
import { makePayload } from '../src/physics/payload';
import { runSweep, findSweepParam } from '../src/physics/sweep';
import { rotunBotLike, smallDemoBot } from '../src/state/presets';
import { bareConfig } from './helpers';

describe('sweeps', () => {
  it('finds parameters by friendly label and sweeps them', () => {
    const c = smallDemoBot();
    expect(findSweepParam(c, 'Battery.position.y')).toBeDefined();
    const rows = runSweep(c, 'Battery.position.y', -0.03, 0.03, 7);
    expect(rows).toHaveLength(7);
    const ys = rows.map((r) => r.results.mass.total.com[1]);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    // β₀ = 0 when the battery is centred
    expect(rows[3].results.trim.beta.beta0).toBeLessThan(rows[0].results.trim.beta.beta0);
  });
  it('heavier pendulum → more drive torque', () => {
    const rows = runSweep(smallDemoBot(), 'Pendulum.mass', 0.4, 1.2, 5);
    for (let i = 1; i < rows.length; i++) expect(rows[i].results.drive.tauGMax).toBeGreaterThan(rows[i - 1].results.drive.tauGMax);
  });
});

describe('geometry checks', () => {
  it('flags an object outside the shell inner radius', () => {
    const c = bareConfig({ R: 0.2 });
    c.payloads = [makePayload('box', { id: 'x', name: 'Box', shape: { kind: 'box', size: [0.02, 0.02, 0.02] }, position: [0, 0.19, 0] })];
    expect(geometryChecks(c).some((w) => w.kind === 'outsideShell' && w.ids.includes('x'))).toBe(true);
  });
  it('flags a pendulum that sweeps into the shell', () => {
    const c = bareConfig({ R: 0.2, rp: 0.19 });
    c.pendulum.bobShape = { kind: 'solidSphere', radius: 0.03 };
    expect(geometryChecks(c).some((w) => w.kind === 'pendulumSweep')).toBe(true);
  });
  it('both presets are clean', () => {
    expect(geometryChecks(smallDemoBot())).toEqual([]);
    expect(geometryChecks(rotunBotLike())).toEqual([]);
  });
});
