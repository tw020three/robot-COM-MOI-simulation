/**
 * Milestone 1 placeholder: renders the physics-core results for the presets as a table.
 * The full editor (3D viewport, panels, charts) arrives in milestones 2–4.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { computeAll } from './physics/results';
import { PRESETS } from './state/presets';

const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(2)}°`;
const mm = (m: number) => `${(m * 1000).toFixed(2)} mm`;

function Placeholder() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 900 }}>
      <h1>Spherical robot mass-property simulator</h1>
      <p>Milestone 1: physics core. The interactive editor comes in milestone 2.</p>
      {PRESETS.map((p) => {
        const cfg = p.make();
        const r = computeAll(cfg);
        const rows: [string, string][] = [
          ['Total mass M', `${r.mass.total.mass.toFixed(3)} kg`],
          ['CoM (x, y, z)', r.mass.total.com.map(mm).join(', ')],
          ['|CoM offset| / R', r.mass.comOffsetRatio.toFixed(4)],
          ['I_spin', `${r.mass.Ispin.toExponential(4)} kg·m²`],
          ['I_yaw', `${r.mass.Iyaw.toExponential(4)} kg·m²`],
          ['Principal moments', r.mass.principal.moments.map((x) => x.toExponential(4)).join(', ') + ' kg·m²'],
          ['Trim tilt β₀', r.trim.beta.feasible ? deg(r.trim.beta.beta0) : 'cannot trim: payload too far off-centre'],
          ['Static lean φ', deg(r.trim.lean)],
          ['τ_max', `${r.drive.tauMax.toFixed(3)} N·m (${r.drive.binding})`],
          ['Max slope', deg(r.drive.maxSlope)],
          ['Max step', mm(r.drive.maxStep)],
          ['v_max', `${r.speed.vMax.toFixed(3)} m/s (${r.speed.binding})`],
          ['ρ_min at current speed', `${r.turning.rhoMinAtSpeed.toFixed(3)} m`],
        ];
        return (
          <section key={p.id}>
            <h2>{cfg.name}</h2>
            <table>
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ paddingRight: 16 }}>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
