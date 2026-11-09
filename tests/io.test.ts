import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/physics/results';
import { componentsCSV, resultsCSV } from '../src/physics/report';
import { ConfigError, parseConfig, serializeConfig } from '../src/state/io';
import { rotunBotLike, smallDemoBot } from '../src/state/presets';

describe('save / load', () => {
  it('round-trips both presets exactly', () => {
    for (const c of [smallDemoBot(), rotunBotLike()]) {
      const { config, notes } = parseConfig(serializeConfig(c));
      expect(config).toEqual(c);
      expect(notes).toEqual([]);
    }
  });
  it('accepts a bare config and fills missing sections with notes', () => {
    const c = smallDemoBot() as unknown as Record<string, unknown>;
    delete c.drive;
    const { config, notes } = parseConfig(JSON.stringify(c));
    expect(config.drive).toEqual(smallDemoBot().drive);
    expect(notes.some((n) => n.startsWith('drive missing'))).toBe(true);
  });
  it('rejects bad values and lists every problem', () => {
    const c = smallDemoBot();
    const bad = JSON.parse(serializeConfig(c));
    bad.config.shell.mass = -1;
    bad.config.payloads[0].shape = { kind: 'banana' };
    bad.config.architecture = 'C';
    try {
      parseConfig(JSON.stringify(bad));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const p = (e as ConfigError).problems.join('\n');
      expect(p).toMatch(/shell.mass must be ≥ 0/);
      expect(p).toMatch(/payloads\[0\].shape.kind/);
      expect(p).toMatch(/architecture/);
    }
  });
  it('rejects non-JSON, other formats and newer versions', () => {
    expect(() => parseConfig('{not json')).toThrow(ConfigError);
    expect(() => parseConfig(JSON.stringify({ format: 'other', version: 1, config: {} }))).toThrow(/unknown file format/);
    expect(() => parseConfig(JSON.stringify({ format: 'spherical-robot-config', version: 99, config: {} }))).toThrow(/newer/);
  });
});

describe('results export', () => {
  const cfg = smallDemoBot();
  const r = computeAll(cfg);
  it('results CSV lists the headline numbers with units', () => {
    const lines = resultsCSV(cfg, r).trim().split('\n');
    expect(lines[0]).toBe('section,quantity,value,unit,note');
    const mass = lines.find((l) => l.startsWith('mass,total mass M,'))!;
    expect(parseFloat(mass.split(',')[2])).toBeCloseTo(r.mass.total.mass, 12);
    expect(lines.some((l) => l.startsWith('mass,about CoM I_xy,'))).toBe(true);
    expect(lines.some((l) => l.startsWith('speed,v_max,'))).toBe(true);
  });
  it('component CSV: masses sum to M and I_O,yy shares sum to 100 %', () => {
    const lines = componentsCSV(r).trim().split('\n').slice(1).map((l) => l.split(','));
    const incl = lines.filter((l) => l[4] === 'true');
    expect(incl.reduce((a, l) => a + parseFloat(l[5]), 0)).toBeCloseTo(r.mass.total.mass, 12);
    expect(incl.reduce((a, l) => a + parseFloat(l[15]), 0)).toBeCloseTo(100, 9);
  });
});
