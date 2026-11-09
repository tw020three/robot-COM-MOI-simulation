/**
 * Save/load of RobotConfig as JSON. Pure (no DOM) so it is unit-testable.
 *
 * File format: { "format": "spherical-robot-config", "version": 1, "savedAt": ISO date, "config": RobotConfig }
 * All values SI (m, kg, rad, rad/s). A bare RobotConfig object is also accepted.
 *
 * Loading is forgiving about missing fields (filled from the defaults, reported as notes) and strict
 * about wrong ones (non-numeric, negative mass, unknown shape …), which are reported as errors.
 */
import { shapeVolume, type Shape } from '../physics/primitives';
import type { PayloadComponent, RobotConfig } from '../physics/types';
import { smallDemoBot } from './presets';

export const FILE_FORMAT = 'spherical-robot-config';
export const FILE_VERSION = 1;

export function serializeConfig(cfg: RobotConfig, now = new Date()): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, savedAt: now.toISOString(), config: cfg }, null, 2);
}

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`Invalid robot file:\n- ${problems.join('\n- ')}`);
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

interface Ctx {
  errors: string[];
  notes: string[];
}

function num(src: Obj, key: string, def: number, path: string, ctx: Ctx, opt: { min?: number; nullable?: boolean } = {}): number {
  const v = src[key];
  if (v === undefined) {
    ctx.notes.push(`${path}.${key} missing — using default ${def}`);
    return def;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    ctx.errors.push(`${path}.${key} must be a finite number (got ${JSON.stringify(v)})`);
    return def;
  }
  if (opt.min !== undefined && v < opt.min) ctx.errors.push(`${path}.${key} must be ≥ ${opt.min} (got ${v})`);
  return v;
}
function bool(src: Obj, key: string, def: boolean, path: string, ctx: Ctx): boolean {
  const v = src[key];
  if (v === undefined) return def;
  if (typeof v !== 'boolean') {
    ctx.errors.push(`${path}.${key} must be true/false`);
    return def;
  }
  return v;
}
function str(src: Obj, key: string, def: string, path: string, ctx: Ctx): string {
  const v = src[key];
  if (v === undefined) return def;
  if (typeof v !== 'string') {
    ctx.errors.push(`${path}.${key} must be a string`);
    return def;
  }
  return v;
}
function vec(src: Obj, key: string, def: [number, number, number], path: string, ctx: Ctx, min?: number): [number, number, number] {
  const v = src[key];
  if (v === undefined) {
    ctx.notes.push(`${path}.${key} missing — using default`);
    return def;
  }
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    ctx.errors.push(`${path}.${key} must be an array of 3 finite numbers`);
    return def;
  }
  if (min !== undefined && v.some((x: number) => x < min)) ctx.errors.push(`${path}.${key} entries must be ≥ ${min}`);
  return [v[0], v[1], v[2]];
}
function section(src: Obj, key: string, ctx: Ctx): Obj {
  const v = src[key];
  if (v === undefined) {
    ctx.notes.push(`${key} missing — using defaults`);
    return {};
  }
  if (!isObj(v)) {
    ctx.errors.push(`${key} must be an object`);
    return {};
  }
  return v;
}

const SHAPE_KINDS = ['point', 'solidSphere', 'hollowSphere', 'box', 'cylinder', 'tube', 'rod'] as const;

function shape(v: unknown, path: string, ctx: Ctx, allowed: readonly string[] = SHAPE_KINDS): Shape {
  if (!isObj(v) || typeof v.kind !== 'string' || !allowed.includes(v.kind)) {
    ctx.errors.push(`${path}.kind must be one of ${allowed.join(', ')}`);
    return { kind: 'point' };
  }
  const p = `${path}`;
  switch (v.kind) {
    case 'point':
      return { kind: 'point' };
    case 'solidSphere':
      return { kind: 'solidSphere', radius: num(v, 'radius', 0.01, p, ctx, { min: 0 }) };
    case 'hollowSphere': {
      const outerRadius = num(v, 'outerRadius', 0.01, p, ctx, { min: 0 });
      const innerRadius = num(v, 'innerRadius', 0, p, ctx, { min: 0 });
      if (innerRadius > outerRadius) ctx.errors.push(`${p}.innerRadius must not exceed outerRadius`);
      return { kind: 'hollowSphere', outerRadius, innerRadius };
    }
    case 'box':
      return { kind: 'box', size: vec(v, 'size', [0.01, 0.01, 0.01], p, ctx, 0) };
    case 'cylinder':
      return { kind: 'cylinder', radius: num(v, 'radius', 0.01, p, ctx, { min: 0 }), length: num(v, 'length', 0.01, p, ctx, { min: 0 }) };
    case 'tube': {
      const outerRadius = num(v, 'outerRadius', 0.01, p, ctx, { min: 0 });
      const innerRadius = num(v, 'innerRadius', 0, p, ctx, { min: 0 });
      if (innerRadius > outerRadius) ctx.errors.push(`${p}.innerRadius must not exceed outerRadius`);
      return { kind: 'tube', outerRadius, innerRadius, length: num(v, 'length', 0.01, p, ctx, { min: 0 }) };
    }
    default:
      return { kind: 'rod', length: num(v, 'length', 0.01, p, ctx, { min: 0 }) };
  }
}

function appearance<T extends { color: string; visible: boolean; included: boolean }>(src: Obj, def: T, path: string, ctx: Ctx) {
  return { color: str(src, 'color', def.color, path, ctx), visible: bool(src, 'visible', def.visible, path, ctx), included: bool(src, 'included', def.included, path, ctx) };
}

export interface ParseResult {
  config: RobotConfig;
  /** Non-fatal: fields that were missing and filled from defaults. */
  notes: string[];
}

/** Parse and validate a saved file. Throws ConfigError listing every problem. */
export function parseConfig(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ConfigError([`not valid JSON (${(e as Error).message})`]);
  }
  if (!isObj(raw)) throw new ConfigError(['top level must be a JSON object']);
  let c: Obj = raw;
  if (raw.format !== undefined) {
    if (raw.format !== FILE_FORMAT) throw new ConfigError([`unknown file format "${String(raw.format)}"`]);
    if (typeof raw.version !== 'number' || raw.version > FILE_VERSION)
      throw new ConfigError([`file version ${String(raw.version)} is newer than this app understands (${FILE_VERSION})`]);
    if (!isObj(raw.config)) throw new ConfigError(['"config" must be an object']);
    c = raw.config;
  }
  const ctx: Ctx = { errors: [], notes: [] };
  const d = smallDemoBot();

  const sh = section(c, 'shell', ctx);
  const shell = {
    outerRadius: num(sh, 'outerRadius', d.shell.outerRadius, 'shell', ctx, { min: 1e-6 }),
    thickness: num(sh, 'thickness', d.shell.thickness, 'shell', ctx, { min: 0 }),
    mass: num(sh, 'mass', d.shell.mass, 'shell', ctx, { min: 0 }),
    ...appearance(sh, d.shell, 'shell', ctx),
  };
  if (shell.thickness > shell.outerRadius) ctx.errors.push('shell.thickness must not exceed shell.outerRadius');

  const ax = section(c, 'axle', ctx);
  const axle = {
    mass: num(ax, 'mass', d.axle.mass, 'axle', ctx, { min: 0 }),
    radius: num(ax, 'radius', d.axle.radius, 'axle', ctx, { min: 0 }),
    length: num(ax, 'length', d.axle.length, 'axle', ctx, { min: 0 }),
    ...appearance(ax, d.axle, 'axle', ctx),
  };

  const fb = section(c, 'frameBox', ctx);
  const frameBox = {
    enabled: bool(fb, 'enabled', d.frameBox.enabled, 'frameBox', ctx),
    mass: num(fb, 'mass', d.frameBox.mass, 'frameBox', ctx, { min: 0 }),
    size: vec(fb, 'size', d.frameBox.size, 'frameBox', ctx, 0),
    position: vec(fb, 'position', d.frameBox.position, 'frameBox', ctx),
    rotation: vec(fb, 'rotation', d.frameBox.rotation, 'frameBox', ctx),
    ...appearance(fb, d.frameBox, 'frameBox', ctx),
  };

  const pe = section(c, 'pendulum', ctx);
  const pendulum = {
    bobMass: num(pe, 'bobMass', d.pendulum.bobMass, 'pendulum', ctx, { min: 0 }),
    bobShape: (pe.bobShape === undefined ? d.pendulum.bobShape : shape(pe.bobShape, 'pendulum.bobShape', ctx, ['point', 'solidSphere', 'box', 'cylinder'])) as RobotConfig['pendulum']['bobShape'],
    bobRotation: vec(pe, 'bobRotation', d.pendulum.bobRotation, 'pendulum', ctx),
    armEnabled: bool(pe, 'armEnabled', d.pendulum.armEnabled, 'pendulum', ctx),
    armMass: num(pe, 'armMass', d.pendulum.armMass, 'pendulum', ctx, { min: 0 }),
    pivot: vec(pe, 'pivot', d.pendulum.pivot, 'pendulum', ctx),
    armLength: num(pe, 'armLength', d.pendulum.armLength, 'pendulum', ctx, { min: 0 }),
    thetaPMax: num(pe, 'thetaPMax', d.pendulum.thetaPMax, 'pendulum', ctx, { min: 0 }),
    betaMax: num(pe, 'betaMax', d.pendulum.betaMax, 'pendulum', ctx, { min: 0 }),
    ...appearance(pe, d.pendulum, 'pendulum', ctx),
  };

  const po = section(c, 'pose', ctx);
  const pose = {
    thetaP: num(po, 'thetaP', 0, 'pose', ctx),
    beta: num(po, 'beta', 0, 'pose', ctx),
    shellRoll: num(po, 'shellRoll', 0, 'pose', ctx),
  };

  const dr = section(c, 'drive', ctx);
  const fa = dr.frontalArea;
  if (fa !== undefined && fa !== null && (typeof fa !== 'number' || !Number.isFinite(fa) || fa < 0)) ctx.errors.push('drive.frontalArea must be null or a number ≥ 0');
  const drive = {
    gearRatio: num(dr, 'gearRatio', d.drive.gearRatio, 'drive', ctx, { min: 0 }),
    stallTorque: num(dr, 'stallTorque', d.drive.stallTorque, 'drive', ctx, { min: 0 }),
    noLoadSpeed: num(dr, 'noLoadSpeed', d.drive.noLoadSpeed, 'drive', ctx, { min: 0 }),
    mu: num(dr, 'mu', d.drive.mu, 'drive', ctx, { min: 0 }),
    crr: num(dr, 'crr', d.drive.crr, 'drive', ctx, { min: 0 }),
    cd: num(dr, 'cd', d.drive.cd, 'drive', ctx, { min: 0 }),
    frontalArea: typeof fa === 'number' ? fa : null,
    rhoAir: num(dr, 'rhoAir', d.drive.rhoAir, 'drive', ctx, { min: 0 }),
    slope: num(dr, 'slope', d.drive.slope, 'drive', ctx),
    servoRating: num(dr, 'servoRating', d.drive.servoRating, 'drive', ctx, { min: 0 }),
    speed: num(dr, 'speed', d.drive.speed, 'drive', ctx, { min: 0 }),
    g: num(dr, 'g', d.drive.g, 'drive', ctx, { min: 0 }),
  };

  const payloads: PayloadComponent[] = [];
  const rawP = c.payloads ?? [];
  if (!Array.isArray(rawP)) ctx.errors.push('payloads must be an array');
  else {
    const seen = new Set<string>();
    rawP.forEach((p, i) => {
      const path = `payloads[${i}]`;
      if (!isObj(p)) {
        ctx.errors.push(`${path} must be an object`);
        return;
      }
      let id = str(p, 'id', `p${i}`, path, ctx);
      if (seen.has(id)) id = `${id}_${i}`;
      seen.add(id);
      const mount = str(p, 'mount', 'frame', path, ctx);
      if (!['shell', 'frame', 'pendulum'].includes(mount)) ctx.errors.push(`${path}.mount must be shell, frame or pendulum`);
      const scaleMode = str(p, 'scaleMode', 'fixedMass', path, ctx);
      if (!['fixedMass', 'fixedDensity'].includes(scaleMode)) ctx.errors.push(`${path}.scaleMode must be fixedMass or fixedDensity`);
      const s = shape(p.shape, `${path}.shape`, ctx);
      const mass = num(p, 'mass', 0, path, ctx, { min: 0 });
      const vol = shapeVolume(s);
      payloads.push({
        id,
        name: str(p, 'name', `Payload ${i + 1}`, path, ctx),
        mount: mount as PayloadComponent['mount'],
        shape: s,
        mass,
        scaleMode: scaleMode as PayloadComponent['scaleMode'],
        density: p.density === undefined ? (vol > 0 ? mass / vol : 0) : num(p, 'density', 0, path, ctx, { min: 0 }),
        position: vec(p, 'position', [0, 0, 0], path, ctx),
        rotation: vec(p, 'rotation', [0, 0, 0], path, ctx),
        color: str(p, 'color', '#4e79a7', path, ctx),
        visible: bool(p, 'visible', true, path, ctx),
        included: bool(p, 'included', true, path, ctx),
      });
    });
  }

  const architecture = str(c, 'architecture', 'A', 'config', ctx);
  if (architecture !== 'A' && architecture !== 'B') ctx.errors.push('architecture must be "A" or "B"');

  if (ctx.errors.length) throw new ConfigError(ctx.errors);
  return {
    config: {
      version: 1,
      name: str(c, 'name', 'Loaded robot', 'config', ctx),
      architecture: architecture as 'A' | 'B',
      shell,
      axle,
      frameBox,
      pendulum,
      pose,
      drive,
      payloads,
    },
    notes: ctx.notes,
  };
}
