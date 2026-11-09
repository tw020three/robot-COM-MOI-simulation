import { ComponentTree } from './ComponentTree';
import { PoseSliders, Toolbar } from './PoseSliders';
import { PropertyPanel } from './PropertyPanel';
import { Readouts } from './Readouts';
import { Viewport3D } from './Viewport3D';
import { useStore } from '../state/store';

export function App() {
  const name = useStore((s) => s.config.name);
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
        <div className="charts-panel">
          <div className="tabs">
            <span className="tab active">Charts</span>
          </div>
          <div className="charts-placeholder">Turning radius, torque, trim, CoM and principal-moment charts arrive in milestone 3.</div>
        </div>
      </main>
      <aside className="right">
        <Readouts />
      </aside>
    </div>
  );
}
