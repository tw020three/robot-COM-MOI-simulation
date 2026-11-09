/** Live readouts. Red when a limit is exceeded. Hover a row for its formula and source. */
import type { ReactNode } from 'react';
import type { Mat3 } from '../physics/mat3';
import { SMALL_ANGLE_LIMIT } from '../physics/turning';
import { useStore } from '../state/store';
import { useResults } from './hooks';
import { fmt, fmtDeg, fmtInertia, fmtMM, fmtSig, toMM } from './units';

function Row({ label, value, bad, warn, title }: { label: ReactNode; value: ReactNode; bad?: boolean; warn?: boolean; title?: string }) {
  return (
    <div className={`ro-row ${bad ? 'bad' : ''} ${warn ? 'warn' : ''}`} title={title}>
      <span className="ro-label">
        {label}
        {title && <span className="info">ⓘ</span>}
      </span>
      <span className="ro-value">{value}</span>
    </div>
  );
}

function Tensor({ m, label }: { m: Mat3; label: string }) {
  return (
    <div className="tensor" title={`${label}, kg·m². Products of inertia carry the minus sign: I_xy = −Σ m·x·y`}>
      <div className="tensor-label">{label} [kg·m²]</div>
      <table>
        <tbody>
          {[0, 1, 2].map((r) => (
            <tr key={r}>
              {[0, 1, 2].map((c) => (
                <td key={c}>{fmtSig(m[r * 3 + c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Readouts() {
  const r = useResults();
  const cfg = useStore((s) => s.config);
  const m = r.mass;
  const R = cfg.shell.outerRadius;
  const [x, y, z] = m.total.com;
  const t = r.trim, d = r.drive, s = r.speed, tu = r.turning;
  return (
    <div className="readouts">
      <h3>Mass properties</h3>
      <Row label="Total mass M" value={`${fmt(m.total.mass, 3)} kg`} title="M = Σ mᵢ" />
      <Row label="CoM x, y, z" value={`${fmt(toMM(x), 2)}, ${fmt(toMM(y), 2)}, ${fmt(toMM(z), 2)} mm`} title="r_cm = (1/M) Σ mᵢ rᵢ, body frame (x fwd, y left, z up)" />
      <Row label="|CoM offset|" value={`${fmtMM(m.comOffset, 2)}  (${fmt(m.comOffsetRatio, 4)} R)`} />
      <Row label="Vertical offset z_cm" value={fmtMM(z, 2)} bad={z >= 0} title="Must be negative (below O) for the pendulum drive to work" />
      <Tensor m={m.total.inertiaCom} label="I about CoM" />
      <Tensor m={m.total.inertiaO} label="I about O" />
      <Row label="Principal moments" value={m.principal.moments.map((v) => fmtSig(v)).join(', ') + ' kg·m²'} title="Jacobi eigen-decomposition of I_cm" />
      <Row label="Radii of gyration" value={m.principal.gyration.map((v) => fmt(toMM(v), 1)).join(', ') + ' mm'} title="k = √(I/M)" />
      <Row label="I_spin (shell group, y)" value={fmtInertia(m.Ispin)} title="Shell + shell-mounted parts about the axle. Singhal et al.: I_h" />
      <Row label="I_yaw (vertical, O)" value={fmtInertia(m.Iyaw)} title="Whole robot about z through O at θp = β = ψ = 0. Singhal et al.: I_h + 2I_y" />
      <Row label="Pendulum m_p, r_p" value={`${fmt(m.pendulum.mass, 3)} kg, ${fmtMM(m.pendulum.rP, 1)}`} title="Pendulum group (bob + arm + pendulum payloads); r_p = pivot → group CoM" />
      <Row label="Shell-roll CoM wobble" value={`x ±${fmtMM(r.wobble.x.amplitude, 2)}, z ±${fmtMM(r.wobble.z.amplitude, 2)}`} title="CoM excursion over one shell revolution (shell-mounted parts off the axle)" />

      <h3>Trim and lean</h3>
      <Row
        label="Trim tilt β₀"
        value={t.beta.feasible ? fmtDeg(t.beta.beta0) : 'cannot trim: payload too far off-centre'}
        bad={!t.beta.feasible || !t.beta.withinLimit}
        title="β₀ = asin(−(S_y + m_p y_piv)/(m_p r_p)) — puts the CoM on the mid-plane"
      />
      <Row label="Trim pitch θ₀" value={t.theta.feasible ? fmtDeg(t.theta.theta0) : 'cannot trim'} bad={!t.theta.feasible || !t.theta.withinLimit} title="x_cm(θ₀) = 0, solved by bisection" />
      <Row label="Static lean φ" value={fmtDeg(t.lean)} title="φ = atan2(y_cm, −z_cm): the ball rolls sideways until the CoM is under O" />
      <Row label="Steering authority L / R" value={`${fmtDeg(t.authorityLeft, 1)} / ${fmtDeg(t.authorityRight, 1)}`} bad={t.authorityWorst <= 0} title="β_max − β₀ toward +β (left), β_max + β₀ toward −β (right)" />
      <Row
        label="Tilt-servo torque"
        value={`${fmt(t.servoTorqueUpright, 3)} N·m (leaned ${fmt(t.servoTorqueLeaned, 3)})  / ${fmt(cfg.drive.servoRating, 2)} rated`}
        bad={t.servoOverRating}
        title="m_p g r_p |sin(β − φ)| — upright (φ = 0, worst case) and at the static lean. Paper eq. 41 writes sin(β + θ) with its lean θ = −φ"
      />

      <h3>Drive</h3>
      <Row label="τ_max" value={`${fmt(d.tauMax, 3)} N·m (${d.binding})`} title="min(τ_g(θp,max), N·τ_stall, μ·M·g·R); τ_g = g Σ_inner m x" />
      <Row label="Max slope" value={fmtDeg(d.maxSlope, 1)} title="sin α = τ_max/(M g R)" />
      <Row label="Max step" value={fmtMM(d.maxStep, 1)} title="h = R − √(R² − e²), e = τ_max/(M g)" />
      <Row label="Max acceleration" value={`${fmt(d.accelAtMax, 3)} m/s² (shell ${fmt(d.accelAtMax / R, 2)} rad/s²)`} title="a = g Σm x / ((M + I_spin/R²) R − Σ m(−z)) at θp,max" />
      <Row label="v_max" value={`${fmt(s.vMax, 3)} m/s, ψ̇ ${fmt(s.vMax / R, 1)} rad/s (${s.binding})`} bad={s.binding === 'cannot move'} title="Largest v with τ_avail ≥ τ_req, capped at ω_noload R / N" />

      <h3>Turning at v = {fmt(cfg.drive.speed, 2)} m/s</h3>
      <Row label="β_avail" value={`${fmtDeg(tu.betaAvail, 1)} (${tu.betaAvailLimitedBy})`} warn={tu.betaAvail > SMALL_ANGLE_LIMIT} title="Smaller remaining tilt from trim, capped by the servo rating. Above 15° the small-angle model is outside its validity" />
      <Row label="ρ_min" value={fmtMM(tu.rhoMinAtSpeed, 0)} title="max(ρ_eq29(v, β_avail), v²/(μ g)) — Singhal et al. 2023 eq. 29" />
      <Row label="  eq. 29 / traction floor" value={`${fmtMM(tu.rhoModelAtSpeed, 0)} / ${fmtMM(tu.tractionAtSpeed, 0)}`} />
      <Row label="  kinematic cross-check" value={fmtMM(tu.rhoKinematicAtAvail, 0)} title="ρ = R / tan φ (larics decoupled model)" />
      <Row label="Spin rate ψ̇ = v/R" value={`${fmt(cfg.drive.speed / R, 2)} rad/s`} />
      <Row label="Wobble amplitude" value={fmtDeg(tu.wobbleAtSpeed.amplitude, 2)} title="|A| = m_p r_p g β / K — Singhal et al. eq. 26" />
      <Row label="Wobble frequency ω" value={`${fmt(tu.wobbleAtSpeed.omega, 2)} rad/s (${fmt(tu.wobbleAtSpeed.frequencyHz, 2)} Hz)`} title="ω = √(K / I_lean,contact) — Singhal et al. eq. 27" />
      <Row label="Precession rate φ̇" value={`${fmt(tu.wobbleAtSpeed.precession, 3)} rad/s`} title="φ̇_mean = (I_spin/I_yaw) ψ̇ A — Singhal et al. eq. 23" />

      <h3>Geometry ({r.warnings.length ? `${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''}` : 'OK'})</h3>
      {r.warnings.length === 0 ? (
        <div className="ok">No collisions or out-of-shell objects.</div>
      ) : (
        <ul className="warnings">
          {r.warnings.map((w, i) => (
            <li key={i} className="bad">
              {w.message}
            </li>
          ))}
        </ul>
      )}
      <div className="hint">R = {fmtMM(R, 1)}. Lengths in mm; inertia kg·m²; speed m/s; angular speed rad/s; acceleration m/s².</div>
    </div>
  );
}
