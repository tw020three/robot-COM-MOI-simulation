/**
 * Presets. Pure data — no React — so the physics tests can use them.
 */
import { makePayload } from '../physics/payload';
import { thickShellMoment } from '../physics/primitives';
import type { RobotConfig } from '../physics/types';

const deg = (d: number) => (d * Math.PI) / 180;
const rpm = (r: number) => (r * 2 * Math.PI) / 60;

/**
 * Small demo bot. EVERY NUMBER HERE IS A PLACEHOLDER chosen to look like a plausible
 * hobby-scale robot (≈ 20 cm ball, ≈ 2 kg); none of it comes from a real design.
 */
export function smallDemoBot(): RobotConfig {
  return {
    version: 1,
    name: 'Small demo bot (placeholder values)',
    architecture: 'A',
    shell: { outerRadius: 0.1, thickness: 0.003, mass: 0.35, color: '#9ecae1', visible: true, included: true },
    axle: { mass: 0.08, radius: 0.004, length: 0.19, color: '#888888', visible: true, included: true },
    frameBox: {
      enabled: false,
      mass: 0.1,
      size: [0.04, 0.04, 0.01],
      position: [0, 0, 0.03],
      rotation: [0, 0, 0],
      color: '#bab0ac',
      visible: true,
      included: true,
    },
    pendulum: {
      bobMass: 0.8,
      bobShape: { kind: 'cylinder', radius: 0.03, length: 0.03 },
      bobRotation: [0, 0, 0],
      armEnabled: true,
      armMass: 0.04,
      pivot: [0, 0, 0],
      armLength: 0.055,
      thetaPMax: deg(60),
      betaMax: deg(25),
      color: '#e15759',
      visible: true,
      included: true,
    },
    pose: { thetaP: 0, beta: 0, shellRoll: 0 },
    drive: {
      gearRatio: 30,
      stallTorque: 0.05,
      noLoadSpeed: rpm(6000),
      mu: 0.6,
      crr: 0.02,
      cd: 0.47,
      frontalArea: null,
      rhoAir: 1.225,
      slope: 0,
      servoRating: 0.6,
      speed: 1,
      g: 9.81,
    },
    payloads: [
      makePayload('box', {
        id: 'battery',
        name: 'Battery',
        mount: 'frame',
        shape: { kind: 'box', size: [0.04, 0.025, 0.02] },
        mass: 0.15,
        position: [0, 0.035, 0.035],
        color: '#59a14f',
      }),
      makePayload('box', {
        id: 'pcb',
        name: 'Controller PCB',
        mount: 'frame',
        shape: { kind: 'box', size: [0.04, 0.04, 0.006] },
        mass: 0.06,
        position: [0, -0.035, 0.035],
        color: '#f28e2b',
      }),
    ],
  };
}

/**
 * RotunBot-like (Zhang et al. 2025, https://arxiv.org/pdf/2511.01288).
 * From the spec: shell radius 0.40 m, pendulum arm ≈ 0.27 m, heavy pendulum 73.4 kg,
 * shell 27.6 kg, total ≈ 160 kg. The remaining 59 kg is split into a 9 kg axle and a 50 kg
 * frame-mounted "electronics + momentum wheel" block above the axle — an ESTIMATE, not from the paper.
 * The bob is modelled as a 0.24 m × 0.12 m cylinder so it clears the shell (estimate).
 * Drive parameters are placeholders. Use as a mass-property sanity check, not a speed benchmark:
 * the real robot adds a momentum wheel.
 */
export function rotunBotLike(): RobotConfig {
  const base = smallDemoBot();
  return {
    ...base,
    name: 'RotunBot-like (sanity check; frame/drive values estimated)',
    shell: { ...base.shell, outerRadius: 0.4, thickness: 0.008, mass: 27.6 },
    axle: { ...base.axle, mass: 9, radius: 0.025, length: 0.78 },
    frameBox: { ...base.frameBox, enabled: false },
    pendulum: {
      ...base.pendulum,
      bobMass: 73.4,
      bobShape: { kind: 'cylinder', radius: 0.12, length: 0.12 },
      armEnabled: false,
      armMass: 0,
      armLength: 0.27,
      thetaPMax: deg(60),
      betaMax: deg(20),
    },
    drive: { ...base.drive, gearRatio: 20, stallTorque: 20, noLoadSpeed: rpm(3000), servoRating: 300, speed: 3 },
    payloads: [
      makePayload('box', {
        id: 'electronics',
        name: 'Electronics + wheel (estimate)',
        mount: 'frame',
        shape: { kind: 'box', size: [0.25, 0.25, 0.12] },
        mass: 50,
        position: [0, 0, 0.14],
        color: '#76b7b2',
      }),
    ],
  };
}

/**
 * GimBall (Aalto University), as published in Ylikorpi, Forsman & Halme 2014, "Dynamic obstacle
 * overcoming capability of pendulum-driven ball-shaped robots" (nomenclature table):
 *   ball mass M₁ = 3.39 kg, pendulum mass M₂ = 2.0 kg, ball radius R = 0.226 m,
 *   pendulum length e = 0.0787 m, ball inertia J₁ = 0.0778 kg·m², contact friction μ = 0.22 (plane).
 * Modelling choices (not from the paper): M₁ is lumped into the shell, whose wall thickness is solved
 * so the thick-shell inertia equals J₁; the pendulum is a point mass (its J₂ is not used by the
 * static/turning formulas); architecture B (only the pendulum pitches, as in the paper's 2-D model).
 * Drive-motor and servo values are PLACEHOLDERS.
 * The paper's quasi-static maximum step height for this robot is 0.0018936 m (a regression test).
 */
export function gimBall(): RobotConfig {
  const base = smallDemoBot();
  const M1 = 3.39, R = 0.226, J1 = 0.0778;
  // thickShellMoment rises monotonically from 2/5·mR² (solid) to 2/3·mR² (thin) as the inner radius grows
  let lo = 0, hi = R;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (thickShellMoment(M1, R, mid) < J1) lo = mid;
    else hi = mid;
  }
  return {
    ...base,
    name: 'GimBall (Ylikorpi et al. 2014; drive values placeholder)',
    architecture: 'B',
    shell: { ...base.shell, outerRadius: R, thickness: R - lo, mass: M1 },
    axle: { ...base.axle, mass: 0, radius: 0.006, length: 2 * (R - (R - lo)) - 0.004 },
    frameBox: { ...base.frameBox, enabled: false },
    pendulum: {
      ...base.pendulum,
      bobMass: 2.0,
      bobShape: { kind: 'point' },
      armEnabled: false,
      armMass: 0,
      armLength: 0.0787,
      thetaPMax: deg(90),
      betaMax: deg(20),
    },
    drive: { ...base.drive, mu: 0.22, gearRatio: 20, stallTorque: 0.5, noLoadSpeed: rpm(3000), servoRating: 2, speed: 1 },
    payloads: [],
  };
}

export const PRESETS: { id: string; label: string; make: () => RobotConfig }[] = [
  { id: 'demo', label: 'Small demo bot (placeholders)', make: smallDemoBot },
  { id: 'gimball', label: 'GimBall (Ylikorpi et al. 2014)', make: gimBall },
  { id: 'rotunbot', label: 'RotunBot-like (Zhang et al. 2025)', make: rotunBotLike },
];
