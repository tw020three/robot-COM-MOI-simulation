/**
 * Presets. Pure data — no React — so the physics tests can use them.
 */
import { makePayload } from '../physics/payload';
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

export const PRESETS: { id: string; label: string; make: () => RobotConfig }[] = [
  { id: 'demo', label: 'Small demo bot (placeholders)', make: smallDemoBot },
  { id: 'rotunbot', label: 'RotunBot-like (Zhang et al. 2025)', make: rotunBotLike },
];
