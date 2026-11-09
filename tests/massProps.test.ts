import { describe, expect, it } from 'vitest';
import { computeMassProps, shellRollWobble } from '../src/physics/massProps';
import { makePayload } from '../src/physics/payload';
import { isSymmetric } from '../src/physics/mat3';
import { thickShellMoment } from '../src/physics/primitives';
import { smallDemoBot, rotunBotLike } from '../src/state/presets';
import { bareConfig } from './helpers';

const pt = (name: string, m: number, position: [number, number, number], mount: 'shell' | 'frame' | 'pendulum' = 'frame') =>
  makePayload('point', { id: name, name, mass: m, position, mount });

describe('combined CoM', () => {
  it('two equal masses placed symmetrically about O give CoM at O', () => {
    const c = bareConfig({ mp: 0 });
    c.payloads = [pt('a', 1.5, [0.03, -0.05, 0.02]), pt('b', 1.5, [-0.03, 0.05, -0.02])];
    const mp = computeMassProps(c);
    mp.total.com.forEach((x) => expect(Math.abs(x)).toBeLessThan(1e-15));
    expect(mp.total.mass).toBe(3);
  });
  it('moving one object by Δr shifts the CoM by m·Δr/M', () => {
    const c = smallDemoBot();
    const before = computeMassProps(c);
    const bat = c.payloads.find((p) => p.id === 'battery')!;
    const dr: [number, number, number] = [0.01, -0.02, 0.005];
    c.payloads = c.payloads.map((p) => (p.id === 'battery' ? { ...p, position: [p.position[0] + dr[0], p.position[1] + dr[1], p.position[2] + dr[2]] } : p));
    const after = computeMassProps(c);
    for (let k = 0; k < 3; k++) expect(after.total.com[k] - before.total.com[k]).toBeCloseTo((bat.mass * dr[k]) / before.total.mass, 14);
  });
  it('excluded components do not count', () => {
    const c = bareConfig({ mp: 0 });
    c.payloads = [pt('a', 1, [0.05, 0, 0]), { ...pt('b', 5, [-0.05, 0, 0]), included: false }];
    expect(computeMassProps(c).total.com[0]).toBeCloseTo(0.05, 15);
  });
});

describe('tensors and sub-assemblies', () => {
  it('I_cm = I_O − M(|r|²E − r rᵀ) and both are symmetric', () => {
    const mp = computeMassProps(smallDemoBot());
    expect(isSymmetric(mp.total.inertiaO)).toBe(true);
    expect(isSymmetric(mp.total.inertiaCom)).toBe(true);
    const [x, y, z] = mp.total.com, M = mp.total.mass;
    expect(mp.total.inertiaO[0] - mp.total.inertiaCom[0]).toBeCloseTo(M * (y * y + z * z), 14);
    expect(mp.total.inertiaO[1] - mp.total.inertiaCom[1]).toBeCloseTo(-M * x * y, 14);
    expect(mp.principal.moments[0]).toBeGreaterThan(0);
  });
  it('I_spin = shell + shell-mounted parts about the axle; I_yaw about z', () => {
    const c = bareConfig({ mp: 1, rp: 0.1, R: 0.2 });
    c.shell.mass = 2;
    c.payloads = [pt('s', 0.5, [0.15, 0, 0], 'shell')];
    const mp = computeMassProps(c);
    const Ishell = thickShellMoment(2, 0.2, 0.198);
    expect(mp.Ispin).toBeCloseTo(Ishell + 0.5 * 0.15 ** 2, 14);
    expect(mp.Iyaw).toBeCloseTo(Ishell + 0.5 * 0.15 ** 2, 14); // bob on the z axis adds nothing to I_zz
    expect(mp.pendulum.rP).toBeCloseTo(0.1, 15);
    expect(mp.pendulum.mass).toBe(1);
  });
  it('I_spin does not change with shell roll', () => {
    const c = smallDemoBot();
    c.payloads.push(pt('s', 0.2, [0.05, 0.01, 0.06], 'shell'));
    const a = computeMassProps(c).Ispin;
    c.pose.shellRoll = 1.234;
    expect(computeMassProps(c).Ispin).toBeCloseTo(a, 14);
  });
  it('pendulum arm adds to the group and moves r_p', () => {
    const c = bareConfig({ mp: 1, rp: 0.1 });
    c.pendulum.armEnabled = true;
    c.pendulum.armMass = 1;
    const mp = computeMassProps(c);
    expect(mp.pendulum.mass).toBe(2);
    expect(mp.pendulum.rP).toBeCloseTo(0.075, 15);
  });
  it('shell-roll wobble amplitude equals m·r/M for an off-axis shell part', () => {
    const c = bareConfig({ mp: 1 });
    c.payloads = [pt('s', 0.5, [0.1, 0, 0], 'shell')];
    const w = shellRollWobble(c);
    expect(w.x.amplitude).toBeCloseTo((0.5 * 0.1) / 1.5, 12);
    expect(w.z.amplitude).toBeCloseTo((0.5 * 0.1) / 1.5, 2);
  });
});

describe('presets', () => {
  it('RotunBot-like totals about 160 kg with the CoM below O', () => {
    const mp = computeMassProps(rotunBotLike());
    expect(mp.total.mass).toBeCloseTo(160, 6);
    expect(mp.total.com[2]).toBeLessThan(0);
  });
});
