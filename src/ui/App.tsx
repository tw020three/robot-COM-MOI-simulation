import { lazy, Suspense, useRef, useState } from 'react';
import { ComponentTree } from './ComponentTree';
import { PoseSliders, Toolbar } from './PoseSliders';
import { PropertyPanel } from './PropertyPanel';
import { Readouts } from './Readouts';
import { Viewport3D } from './Viewport3D';
import { useStore } from '../state/store';

// Plotly is large: load the charts panel as its own chunk so the editor paints first.
const ChartsPanel = lazy(() => import('./charts/ChartsPanel'));

/** Horizontal divider between viewport and charts; drag to resize the charts panel. */
function useSplit(initial: number) {
  const [h, setH] = useState(initial);
  const start = useRef<{ y: number; h: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, h };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setH(Math.max(140, Math.min(window.innerHeight - 200, start.current.h - (e.clientY - start.current.y))));
  };
  const onPointerUp = () => (start.current = null);
  return { h, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}

export function App() {
  const name = useStore((s) => s.config.name);
  const split = useSplit(Math.round(window.innerHeight * 0.42));
  return (
    <div className="app">
      <header className="topbar">
        <h1>Spherical robot · CoM &amp; inertia</h1>
        <span className="robot-name">{name}</span>
        <Toolbar />
      </header>
      <aside className="left">
        <ComponentTree />
        <PropertyPanel />
      </aside>
      <main className="center">
        <div className="viewport">
          <Viewport3D />
          <PoseSliders />
          <div className="viewport-hint">
            Drag the <b style={{ color: '#ff7f0e' }}>orange</b> handle to change R, the <b style={{ color: '#d62728' }}>red</b> one to change r<sub>p</sub>. Click an object to edit it.
          </div>
        </div>
        <div className="splitter" title="Drag to resize the charts" {...split.handlers} />
        <div className="charts-panel" style={{ height: split.h }}>
          <Suspense fallback={<div className="charts-placeholder">Loading charts…</div>}>
            <ChartsPanel />
          </Suspense>
        </div>
      </main>
      <aside className="right">
        <Readouts />
      </aside>
    </div>
  );
}
