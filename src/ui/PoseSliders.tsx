/** Pose sliders (θp, β, ψ), view toggles, gizmo mode, undo/redo, presets. Overlaid on the viewport. */
import { useEffect } from 'react';
import { PRESETS } from '../state/presets';
import { useStore, type GizmoMode } from '../state/store';
import { useResults } from './hooks';
import { fromDeg, toDeg } from './units';

function Slider({ label, value, min, max, onChange, extra }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; extra?: React.ReactNode }) {
  const begin = useStore((s) => s.beginGesture);
  const end = useStore((s) => s.endGesture);
  return (
    <div className="slider">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={value}
        onPointerDown={begin}
        onPointerUp={end}
        onKeyDown={begin}
        onKeyUp={end}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{value.toFixed(1)}°</span>
      {extra}
    </div>
  );
}

export function PoseSliders() {
  const cfg = useStore((s) => s.config);
  const update = useStore((s) => s.update);
  const setPose = (p: Partial<typeof cfg.pose>) => update((c) => ({ ...c, pose: { ...c.pose, ...p } }));
  const r = useResults();
  const tM = toDeg(cfg.pendulum.thetaPMax), bM = toDeg(cfg.pendulum.betaMax);
  return (
    <div className="pose-sliders">
      <Slider
        label="Pitch θp"
        value={toDeg(cfg.pose.thetaP)}
        min={-tM}
        max={tM}
        onChange={(v) => setPose({ thetaP: fromDeg(v) })}
        extra={
          <button disabled={!r.trim.theta.feasible} title="Set θp to the fore/aft trim θ₀" onClick={() => setPose({ thetaP: r.trim.theta.theta0 })}>
            θ₀
          </button>
        }
      />
      <Slider
        label="Tilt β"
        value={toDeg(cfg.pose.beta)}
        min={-bM}
        max={bM}
        onChange={(v) => setPose({ beta: fromDeg(v) })}
        extra={
          <button disabled={!r.trim.beta.feasible} title="Set β to the lateral trim β₀" onClick={() => setPose({ beta: r.trim.beta.beta0 })}>
            β₀
          </button>
        }
      />
      <Slider label="Shell roll ψ" value={toDeg(cfg.pose.shellRoll)} min={0} max={360} onChange={(v) => setPose({ shellRoll: fromDeg(v) })} />
    </div>
  );
}

export function Toolbar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const setConfig = useStore((s) => s.setConfig);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (!mod && e.key === 'w') setView({ gizmoMode: 'translate' });
      else if (!mod && e.key === 'e') setView({ gizmoMode: 'rotate' });
      else if (!mod && e.key === 'r') setView({ gizmoMode: 'scale' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setView]);

  const modes: [GizmoMode, string][] = [
    ['translate', 'Move (W)'],
    ['rotate', 'Rotate (E)'],
    ['scale', 'Scale (R)'],
  ];
  const toggles: [keyof typeof view, string][] = [
    ['showLean', 'Static lean'],
    ['showSubComs', 'Sub-CoMs'],
    ['showPrincipal', 'Principal axes'],
    ['showEllipsoid', 'Inertia ellipsoid'],
    ['showLabels', 'Labels'],
  ];
  return (
    <div className="toolbar">
      <div className="btn-group">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </button>
      </div>
      <div className="btn-group">
        {modes.map(([m, l]) => (
          <button key={m} className={view.gizmoMode === m ? 'active' : ''} onClick={() => setView({ gizmoMode: m })}>
            {l}
          </button>
        ))}
      </div>
      <div className="btn-group toggles">
        {toggles.map(([k, l]) => (
          <label key={k} className="toggle">
            <input type="checkbox" checked={view[k] as boolean} onChange={(e) => setView({ [k]: e.target.checked })} />
            <span>{l}</span>
          </label>
        ))}
      </div>
      <label className="field preset">
        <span className="field-label">Preset</span>
        <select
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (p) setConfig(p.make());
          }}
        >
          <option value="">Load preset…</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
