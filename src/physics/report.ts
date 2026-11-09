/**
 * Results export as CSV (SI units). Two reports:
 *  - resultsCSV:    every readout, one row per quantity: section, quantity, value, unit, note
 *  - componentsCSV: one row per component at the current pose (mass, CoM, tensor about own CoM in body axes)
 */
import { compositeOf, type MassProps } from './massProps';
import { rotateTensor, type Mat3 } from './mat3';
import type { Results } from './results';
import type { RobotConfig } from './types';

type Row = [section: string, quantity: string, value: number | string, unit: string, note?: string];

const esc = (v: string | number) => {
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : v === Infinity ? 'inf' : v === -Infinity ? '-inf' : '') : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';

function tensorRows(section: string, name: string, I: Mat3): Row[] {
  const ax = ['x', 'y', 'z'];
  const out: Row[] = [];
  for (let r = 0; r < 3; r++) for (let c = r; c < 3; c++) out.push([section, `${name} I_${ax[r]}${ax[c]}`, I[r * 3 + c], 'kg·m²']);
  return out;
}

export function resultsRows(cfg: RobotConfig, r: Results): Row[] {
  const m: MassProps = r.mass;
  const t = r.trim, d = r.drive, s = r.speed, tu = r.turning;
  const R = cfg.shell.outerRadius;
  const rows: Row[] = [
    ['config', 'name', cfg.name, ''],
    ['config', 'architecture', cfg.architecture, '', 'A: whole inner assembly pitches; B: only the pendulum'],
    ['config', 'pitch θp', cfg.pose.thetaP, 'rad'],
    ['config', 'tilt β', cfg.pose.beta, 'rad'],
    ['config', 'shell roll ψ', cfg.pose.shellRoll, 'rad'],
    ['config', 'shell outer radius R', R, 'm'],
    ['mass', 'total mass M', m.total.mass, 'kg'],
    ['mass', 'CoM x', m.total.com[0], 'm', 'body frame: x forward, y left, z up, origin at shell centre'],
    ['mass', 'CoM y', m.total.com[1], 'm'],
    ['mass', 'CoM z', m.total.com[2], 'm', 'negative = below centre (required)'],
    ['mass', '|CoM offset|', m.comOffset, 'm'],
    ['mass', '|CoM offset| / R', m.comOffsetRatio, ''],
    ...tensorRows('mass', 'about CoM', m.total.inertiaCom),
    ...tensorRows('mass', 'about O', m.total.inertiaO),
    ...m.principal.moments.map((v, i): Row => ['mass', `principal moment I${i + 1}`, v, 'kg·m²']),
    ...m.principal.axes.flatMap((a, i): Row[] => a.map((v, k): Row => ['mass', `principal axis ${i + 1} ${'xyz'[k]}`, v, ''])),
    ...m.principal.gyration.map((v, i): Row => ['mass', `radius of gyration k${i + 1}`, v, 'm']),
    ['mass', 'I_spin (shell group about axle)', m.Ispin, 'kg·m²', 'Singhal et al. I_h'],
    ['mass', 'I_yaw (vertical through O)', m.Iyaw, 'kg·m²', 'Singhal et al. I_h + 2I_y'],
    ['mass', 'I_lean (forward axis through O)', m.IleanO, 'kg·m²'],
    ['mass', 'shell group mass', m.shellGroup.mass, 'kg'],
    ['mass', 'inner assembly mass', m.inner.mass, 'kg'],
    ['mass', 'pendulum group mass m_p', m.pendulum.mass, 'kg'],
    ['mass', 'pendulum CoM radius r_p', m.pendulum.rP, 'm', 'pivot to pendulum-group CoM'],
    ['mass', 'shell-roll CoM wobble x (half-range)', r.wobble.x.amplitude, 'm'],
    ['mass', 'shell-roll CoM wobble z (half-range)', r.wobble.z.amplitude, 'm'],
    ['trim', 'trim tilt β₀', t.beta.feasible ? t.beta.beta0 : 'cannot trim', t.beta.feasible ? 'rad' : ''],
    ['trim', 'trim tilt within β_max', String(t.beta.withinLimit), ''],
    ['trim', 'trim pitch θ₀', t.theta.feasible ? t.theta.theta0 : 'cannot trim', t.theta.feasible ? 'rad' : ''],
    ['trim', 'static lean φ', t.lean, 'rad', 'atan2(y_cm, −z_cm)'],
    ['trim', 'steering authority left', t.authorityLeft, 'rad'],
    ['trim', 'steering authority right', t.authorityRight, 'rad'],
    ['trim', 'tilt-servo torque (upright)', t.servoTorqueUpright, 'N·m'],
    ['trim', 'tilt-servo torque (static lean)', t.servoTorqueLeaned, 'N·m'],
    ['trim', 'tilt-servo rating', cfg.drive.servoRating, 'N·m'],
    ['drive', 'τ_g(θp,max)', d.tauGMax, 'N·m'],
    ['drive', 'N·τ_stall', d.tauMotorMax, 'N·m'],
    ['drive', 'μ·M·g·R', d.tauTraction, 'N·m'],
    ['drive', 'τ_max', d.tauMax, 'N·m', `binding: ${d.binding}`],
    ['drive', 'max slope', d.maxSlope, 'rad'],
    ['drive', 'max step height', d.maxStep, 'm'],
    ['drive', 'max acceleration (flat, θp,max)', d.accelAtMax, 'm/s²'],
    ['drive', 'shell angular acceleration at max', d.accelAtMax / R, 'rad/s²'],
    ['speed', 'v_max', s.vMax, 'm/s', `binding: ${s.binding}`],
    ['speed', 'shell spin rate at v_max', s.vMax / R, 'rad/s'],
    ['speed', 'no-load speed cap ω_noload·R/N', s.vCap, 'm/s'],
    ['speed', 'steady pitch at v_max', s.thetaSSAtVmax, 'rad'],
    ['turning', 'current speed v', cfg.drive.speed, 'm/s'],
    ['turning', 'β_avail', tu.betaAvail, 'rad', `limited by ${tu.betaAvailLimitedBy}`],
    ['turning', 'ρ_min', tu.rhoMinAtSpeed, 'm'],
    ['turning', 'ρ eq. 29 at β_avail', tu.rhoModelAtSpeed, 'm', 'Singhal et al. 2023'],
    ['turning', 'traction floor v²/(μg)', tu.tractionAtSpeed, 'm'],
    ['turning', 'kinematic ρ = R/tanφ', tu.rhoKinematicAtAvail, 'm', 'cross-check'],
    ['turning', 'outside small-angle validity (β_avail > 15°)', String(tu.outsideSmallAngle), ''],
    ['turning', 'wobble amplitude', tu.wobbleAtSpeed.amplitude, 'rad', 'eq. 26'],
    ['turning', 'wobble frequency ω', tu.wobbleAtSpeed.omega, 'rad/s', 'eq. 27'],
    ['turning', 'precession rate', tu.wobbleAtSpeed.precession, 'rad/s', 'eq. 23'],
    ...r.warnings.map((w): Row => ['geometry', `warning (${w.kind})`, w.message, '']),
  ];
  return rows;
}

export function resultsCSV(cfg: RobotConfig, r: Results): string {
  return csv([['section', 'quantity', 'value', 'unit', 'note'], ...resultsRows(cfg, r).map((x) => [x[0], x[1], x[2], x[3], x[4] ?? ''])]);
}

export function componentsCSV(r: Results): string {
  const head = ['id', 'name', 'mount', 'shape', 'included', 'mass [kg]', 'CoM x [m]', 'CoM y [m]', 'CoM z [m]',
    'I_xx [kg·m²]', 'I_yy [kg·m²]', 'I_zz [kg·m²]', 'I_xy [kg·m²]', 'I_xz [kg·m²]', 'I_yz [kg·m²]', 'share of I_O,yy [%]'];
  const IOyy = r.mass.total.inertiaO[4];
  const rows = r.mass.items.map((it) => {
    const I = rotateTensor(it.world.R, it.Ilocal); // about own CoM, body axes
    const own = compositeOf([it], () => true).inertiaO[4];
    return [it.id, it.name, it.mount, it.shape.kind, String(it.included), it.mass, ...it.com, I[0], I[4], I[8], I[1], I[2], I[5],
      it.included && IOyy > 0 ? (100 * own) / IOyy : 0];
  });
  return csv([head, ...rows]);
}
