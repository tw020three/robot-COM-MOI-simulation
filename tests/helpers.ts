import type { RobotConfig } from '../src/physics/types';

/**
 * A config with every built-in set to zero mass except a point-mass pendulum bob of mass mp
 * hanging r_p below a pivot at O. Tests add only what they need.
 */
export function bareConfig(opts: { mp?: number; rp?: number; R?: number; arch?: 'A' | 'B' } = {}): RobotConfig {
  const { mp = 2, rp = 0.1, R = 0.2, arch = 'B' } = opts;
  return {
    version: 1,
    name: 'test',
    architecture: arch,
    shell: { outerRadius: R, thickness: 0.002, mass: 0, color: '#fff', visible: true, included: true },
    axle: { mass: 0, radius: 0.005, length: 0.1, color: '#fff', visible: true, included: true },
    frameBox: { enabled: false, mass: 0, size: [0.1, 0.1, 0.1], position: [0, 0, 0], rotation: [0, 0, 0], color: '#fff', visible: true, included: true },
    pendulum: {
      bobMass: mp,
      bobShape: { kind: 'point' },
      bobRotation: [0, 0, 0],
      armEnabled: false,
      armMass: 0,
      pivot: [0, 0, 0],
      armLength: rp,
      thetaPMax: Math.PI / 2,
      betaMax: Math.PI / 6,
      color: '#fff',
      visible: true,
      included: true,
    },
    pose: { thetaP: 0, beta: 0, shellRoll: 0 },
    drive: {
      gearRatio: 1, stallTorque: 1e6, noLoadSpeed: 1e6, mu: 1e3, crr: 0, cd: 0, frontalArea: null,
      rhoAir: 0, slope: 0, servoRating: 1e6, speed: 1, g: 9.81,
    },
    payloads: [],
  };
}
