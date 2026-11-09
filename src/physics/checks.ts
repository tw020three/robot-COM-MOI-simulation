/**
 * Geometry checks (spec §3). Warnings only, never blocking.
 *  1. Any object reaching outside the shell's inner radius (exact for boxes, sampled rims for cylinders).
 *  2. Pendulum sweep over ±θp,max × ±β_max hitting the shell or a non-pendulum object (bounding spheres).
 *  3. Overlapping objects by bounding-sphere test (the axle is excluded: everything hangs on it).
 */
import { AXLE_ID, posedItems, SHELL_ID, type PosedItem } from './massProps';
import { applyPose } from './pose';
import { boundingRadius, shapeHullPoints } from './primitives';
import type { RobotConfig } from './types';
import { dist, dot, norm, sub, type Vec3 } from './vec';

export interface GeometryWarning {
  kind: 'outsideShell' | 'pendulumSweep' | 'overlap';
  ids: string[];
  message: string;
}

const EPS = 1e-9;

/** Farthest distance from O reached by an item at its current pose (m). */
export function maxExtent(it: PosedItem): number {
  if (it.shape.kind === 'solidSphere') return norm(it.com) + it.shape.radius;
  if (it.shape.kind === 'hollowSphere') return norm(it.com) + it.shape.outerRadius;
  return Math.max(...shapeHullPoints(it.shape).map((p) => norm(applyPose(it.world, p))));
}

export function geometryChecks(cfg: RobotConfig, sweepSteps = 5): GeometryWarning[] {
  const warnings: GeometryWarning[] = [];
  const Rin = Math.max(0, cfg.shell.outerRadius - cfg.shell.thickness);
  const items = posedItems(cfg).filter((it) => it.id !== SHELL_ID);

  for (const it of items) {
    const ext = maxExtent(it);
    if (ext > Rin + EPS)
      warnings.push({
        kind: 'outsideShell',
        ids: [it.id],
        message: `${it.name} reaches ${(ext * 1000).toFixed(1)} mm from O, beyond the shell inner radius ${(Rin * 1000).toFixed(1)} mm`,
      });
  }

  // Pendulum sweep
  const p = cfg.pendulum;
  const lin = (a: number, n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -a + (2 * a * i) / (n - 1)));
  const others = items.filter((it) => it.mount !== 'pendulum' && it.id !== AXLE_ID);
  const hitShell = new Set<string>();
  const hitObj = new Set<string>();
  for (const th of lin(p.thetaPMax, sweepSteps)) {
    for (const b of lin(p.betaMax, sweepSteps)) {
      const posed = posedItems(cfg, { ...cfg.pose, thetaP: th, beta: b }).filter((it) => it.mount === 'pendulum');
      // Frame-mounted objects pitch with θp in arch A, so re-pose them too.
      const othersHere =
        cfg.architecture === 'A'
          ? posedItems(cfg, { ...cfg.pose, thetaP: th, beta: b }).filter((it) => others.some((o) => o.id === it.id))
          : others;
      for (const pi of posed) {
        if (maxExtent(pi) > Rin + EPS && !hitShell.has(pi.id)) {
          hitShell.add(pi.id);
          warnings.push({
            kind: 'pendulumSweep',
            ids: [pi.id],
            message: `${pi.name} hits the shell within the pendulum sweep (θp = ${deg(th)}°, β = ${deg(b)}°)`,
          });
        }
        for (const o of othersHere) {
          // In arch A frame objects move rigidly with the pendulum in pitch; only β changes their relation.
          const key = `${pi.id}|${o.id}`;
          if (hitObj.has(key)) continue;
          if (collide(pi, o)) {
            hitObj.add(key);
            warnings.push({
              kind: 'pendulumSweep',
              ids: [pi.id, o.id],
              message: `${pi.name} may hit ${o.name} within the pendulum sweep (θp = ${deg(th)}°, β = ${deg(b)}°; bounding spheres)`,
            });
          }
        }
      }
    }
  }

  // Overlaps at the current pose (bounding spheres). Skip the axle and pendulum-internal pairs (bob ↔ arm).
  const cand = items.filter((it) => it.id !== AXLE_ID && it.shape.kind !== 'point');
  for (let i = 0; i < cand.length; i++)
    for (let j = i + 1; j < cand.length; j++) {
      const a = cand[i], b = cand[j];
      if (a.mount === 'pendulum' && b.mount === 'pendulum' && (a.kind === 'arm' || b.kind === 'arm')) continue;
      if (collide(a, b))
        warnings.push({ kind: 'overlap', ids: [a.id, b.id], message: `${a.name} and ${b.name} overlap (bounding spheres)` });
    }
  return warnings;
}

/** Distance from point p to the segment a–b. */
export function segmentPointDistance(a: Vec3, b: Vec3, p: Vec3): number {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
  return dist(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]);
}

/** Bounding-sphere test; a slender rod is treated as a segment instead of a sphere. */
function collide(a: PosedItem, b: PosedItem): boolean {
  const ends = (it: PosedItem): [Vec3, Vec3] | null =>
    it.shape.kind === 'rod' ? [applyPose(it.world, [0, 0, -it.shape.length / 2]), applyPose(it.world, [0, 0, it.shape.length / 2])] : null;
  const ea = ends(a), eb = ends(b);
  if (ea && eb) return false; // rod–rod: ignored
  if (ea) return segmentPointDistance(ea[0], ea[1], b.com) < boundingRadius(b.shape) - EPS;
  if (eb) return segmentPointDistance(eb[0], eb[1], a.com) < boundingRadius(a.shape) - EPS;
  return dist(a.com, b.com) < boundingRadius(a.shape) + boundingRadius(b.shape) - EPS;
}

const deg = (r: number) => ((r * 180) / Math.PI).toFixed(0);
