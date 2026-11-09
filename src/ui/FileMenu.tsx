/** Save/load the robot as JSON and export results as CSV. */
import { useRef } from 'react';
import { componentsCSV, resultsCSV } from '../physics/report';
import { computeAll } from '../physics/results';
import { ConfigError, parseConfig, serializeConfig } from '../state/io';
import { useStore } from '../state/store';
import { download, slug } from './download';

export function FileMenu() {
  const fileRef = useRef<HTMLInputElement>(null);
  const setConfig = useStore((s) => s.setConfig);
  const setMessage = useStore((s) => s.setMessage);

  const save = () => {
    const c = useStore.getState().config;
    download(`${slug(c.name)}.json`, new Blob([serializeConfig(c)], { type: 'application/json' }));
  };
  const load = async (f: File) => {
    try {
      const { config, notes } = parseConfig(await f.text());
      setConfig(config);
      setMessage(notes.length ? { kind: 'info', text: `Loaded ${f.name}. Filled from defaults: ${notes.join('; ')}` } : { kind: 'info', text: `Loaded ${f.name}.` });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof ConfigError ? `${f.name}: ${e.problems.join(' · ')}` : `${f.name}: ${(e as Error).message}` });
    }
  };
  const exportResults = () => {
    const c = useStore.getState().config;
    download(`${slug(c.name)}-results.csv`, new Blob([resultsCSV(c, computeAll(c))], { type: 'text/csv' }));
  };
  const exportComponents = () => {
    const c = useStore.getState().config;
    download(`${slug(c.name)}-components.csv`, new Blob([componentsCSV(computeAll(c))], { type: 'text/csv' }));
  };

  return (
    <div className="btn-group">
      <button onClick={save} title="Download the robot configuration as JSON (SI units)">
        Save
      </button>
      <button onClick={() => fileRef.current?.click()} title="Load a robot configuration JSON">
        Load…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) load(f);
          e.target.value = '';
        }}
      />
      <button onClick={exportResults} title="Every readout as CSV: section, quantity, value, unit (SI)">
        Results CSV
      </button>
      <button onClick={exportComponents} title="Per-component mass, CoM and inertia at the current pose (SI)">
        Components CSV
      </button>
    </div>
  );
}

export function MessageBanner() {
  const m = useStore((s) => s.message);
  const setMessage = useStore((s) => s.setMessage);
  if (!m) return null;
  return (
    <div className={`banner ${m.kind}`} role={m.kind === 'error' ? 'alert' : 'status'}>
      <span>{m.text}</span>
      <button onClick={() => setMessage(null)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
