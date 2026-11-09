/** Numeric editor for the selected component. Lengths in mm, angles in degrees, mass in kg. */
import { armLengthForRp, AXLE_ID, BOB_ID, computeMassProps, FRAMEBOX_ID, SHELL_ID } from '../physics/massProps';
import { defaultShape, effectiveDensity, newId, withMass, withShape } from '../physics/payload';
import { shapeVolume, type Shape, type ShapeKind } from '../physics/primitives';
import type { BobShape, Mount, PayloadComponent, RobotConfig } from '../physics/types';
import type { Vec3 } from '../physics/vec';
import { ROBOT_ID, useStore } from '../state/store';
import { SHAPE_LABELS } from './ComponentTree';
import { ColorField, NumberField, Section, Select, TextField, Toggle, Vec3Field } from './fields';
import { fmt, fromDeg, fromMM, radSToRpm, rpmToRadS, toDeg, toMM } from './units';

const mmV = (v: Vec3): Vec3 => v.map(toMM) as Vec3;
const mV = (v: Vec3): Vec3 => v.map(fromMM) as Vec3;
const degV = (v: Vec3): Vec3 => v.map(toDeg) as Vec3;
const radV = (v: Vec3): Vec3 => v.map(fromDeg) as Vec3;

/** Dimension fields for a shape, in mm. */
function ShapeFields({ shape, onChange }: { shape: Shape; onChange: (s: Shape) => void }) {
  const L = (label: string, v: number, set: (x: number) => Shape) => (
    <NumberField label={label} unit="mm" value={toMM(v)} min={0} step={1} onChange={(x) => onChange(set(fromMM(x)))} />
  );
  switch (shape.kind) {
    case 'point':
      return null;
    case 'solidSphere':
      return L('Radius', shape.radius, (x) => ({ ...shape, radius: x }));
    case 'hollowSphere':
      return (
        <>
          {L('Outer radius', shape.outerRadius, (x) => ({ ...shape, outerRadius: x }))}
          {L('Inner radius', shape.innerRadius, (x) => ({ ...shape, innerRadius: Math.min(x, shape.outerRadius) }))}
        </>
      );
    case 'box':
      return <Vec3Field label="Size" unit="mm" value={mmV(shape.size)} onChange={(v) => onChange({ ...shape, size: mV(v) })} />;
    case 'cylinder':
      return (
        <>
          {L('Radius', shape.radius, (x) => ({ ...shape, radius: x }))}
          {L('Length (local z)', shape.length, (x) => ({ ...shape, length: x }))}
        </>
      );
    case 'tube':
      return (
        <>
          {L('Outer radius', shape.outerRadius, (x) => ({ ...shape, outerRadius: x }))}
          {L('Inner radius', shape.innerRadius, (x) => ({ ...shape, innerRadius: Math.min(x, shape.outerRadius) }))}
          {L('Length (local z)', shape.length, (x) => ({ ...shape, length: x }))}
        </>
      );
    case 'rod':
      return L('Length', shape.length, (x) => ({ ...shape, length: x }));
  }
}

function Appearance({ v, set }: { v: { color: string; visible: boolean; included: boolean }; set: (p: Partial<{ color: string; visible: boolean; included: boolean }>) => void }) {
  return (
    <div className="row-wrap">
      <ColorField label="Color" value={v.color} onChange={(color) => set({ color })} />
      <Toggle label="Visible" checked={v.visible} onChange={(visible) => set({ visible })} />
      <Toggle label="Include in calculations" checked={v.included} onChange={(included) => set({ included })} />
    </div>
  );
}

function RobotPanel({ c, update }: { c: RobotConfig; update: (f: (c: RobotConfig) => RobotConfig) => void }) {
  const d = c.drive;
  const setD = (p: Partial<RobotConfig['drive']>) => update((c) => ({ ...c, drive: { ...c.drive, ...p } }));
  return (
    <>
      <Section title="Robot">
        <TextField label="Name" value={c.name} onChange={(name) => update((c) => ({ ...c, name }))} />
        <Select
          label="Drive architecture"
          value={c.architecture}
          options={[
            { value: 'A', label: 'A — whole inner assembly pitches' },
            { value: 'B', label: 'B — only the pendulum pitches' },
          ]}
          onChange={(architecture) => update((c) => ({ ...c, architecture }))}
        />
      </Section>
      <Section title="Drive motor">
        <NumberField label="Gear ratio N" value={d.gearRatio} min={0} step={1} onChange={(gearRatio) => setD({ gearRatio })} />
        <NumberField label="Stall torque τ_stall" unit="N·m" value={d.stallTorque} min={0} step={0.01} onChange={(stallTorque) => setD({ stallTorque })} />
        <NumberField label="No-load speed" unit="rpm" value={radSToRpm(d.noLoadSpeed)} min={0} step={100} digits={1} onChange={(v) => setD({ noLoadSpeed: rpmToRadS(v) })} />
        <NumberField label="Tilt-servo rating" unit="N·m" value={d.servoRating} min={0} step={0.05} onChange={(servoRating) => setD({ servoRating })} />
      </Section>
      <Section title="Ground and air">
        <NumberField label="Friction μ" value={d.mu} min={0} step={0.05} onChange={(mu) => setD({ mu })} />
        <NumberField label="Rolling resistance c_rr" value={d.crr} min={0} step={0.005} onChange={(crr) => setD({ crr })} />
        <NumberField label="Drag coefficient C_d" value={d.cd} min={0} step={0.05} onChange={(cd) => setD({ cd })} />
        <NumberField
          label="Frontal area"
          unit="mm²"
          title="Default πR²"
          value={(d.frontalArea ?? Math.PI * c.shell.outerRadius ** 2) * 1e6}
          min={0}
          step={100}
          digits={0}
          onChange={(v) => setD({ frontalArea: v / 1e6 })}
        />
        <Toggle label="Frontal area = πR²" checked={d.frontalArea === null} onChange={(on) => setD({ frontalArea: on ? null : Math.PI * c.shell.outerRadius ** 2 })} />
        <NumberField label="Air density ρ_air" unit="kg/m³" value={d.rhoAir} min={0} step={0.01} onChange={(rhoAir) => setD({ rhoAir })} />
        <NumberField label="Slope α" unit="°" value={toDeg(d.slope)} step={1} onChange={(v) => setD({ slope: fromDeg(v) })} />
        <NumberField label="Current speed v" unit="m/s" value={d.speed} min={0} step={0.1} onChange={(speed) => setD({ speed })} />
        <NumberField label="Gravity g" unit="m/s²" value={d.g} min={0} step={0.01} onChange={(g) => setD({ g })} />
      </Section>
    </>
  );
}

function PendulumPanel({ c, update }: { c: RobotConfig; update: (f: (c: RobotConfig) => RobotConfig) => void }) {
  const p = c.pendulum;
  const setP = (q: Partial<RobotConfig['pendulum']>) => update((c) => ({ ...c, pendulum: { ...c.pendulum, ...q } }));
  const rP = computeMassProps(c).pendulum.rP;
  const bobKinds: BobShape['kind'][] = ['point', 'solidSphere', 'box', 'cylinder'];
  return (
    <>
      <Section title="Pendulum mass">
        <NumberField label="Bob mass m_p (fixed)" unit="kg" value={p.bobMass} min={0} step={0.01} onChange={(bobMass) => setP({ bobMass })} />
        <Select
          label="Bob shape"
          value={p.bobShape.kind}
          options={bobKinds.map((k) => ({ value: k, label: SHAPE_LABELS[k] }))}
          onChange={(k) => setP({ bobShape: defaultShape(k) as BobShape })}
        />
        <ShapeFields shape={p.bobShape} onChange={(s) => setP({ bobShape: s as BobShape })} />
        <Vec3Field label="Bob rotation" unit="°" value={degV(p.bobRotation)} onChange={(v) => setP({ bobRotation: radV(v) })} />
        <Toggle label="Arm (slender rod)" checked={p.armEnabled} onChange={(armEnabled) => setP({ armEnabled })} />
        {p.armEnabled && <NumberField label="Arm mass" unit="kg" value={p.armMass} min={0} step={0.01} onChange={(armMass) => setP({ armMass })} />}
      </Section>
      <Section title="Pendulum position">
        <NumberField label="Arm length l (pivot → bob CoM)" unit="mm" value={toMM(p.armLength)} min={0} step={1} onChange={(v) => setP({ armLength: fromMM(v) })} />
        <NumberField
          label="CoM radius r_p (pivot → group CoM)"
          unit="mm"
          title="Sets the arm length so the pendulum group's CoM sits at this distance from the pivot. Also draggable in the 3D view."
          value={toMM(rP)}
          min={0}
          step={1}
          onChange={(v) => {
            const l = armLengthForRp(c, fromMM(v));
            if (l !== null) setP({ armLength: l });
          }}
        />
        <NumberField label="Pivot offset y" unit="mm" value={toMM(p.pivot[1])} step={1} onChange={(v) => setP({ pivot: [p.pivot[0], fromMM(v), p.pivot[2]] })} />
        <NumberField label="Pivot offset z" unit="mm" value={toMM(p.pivot[2])} step={1} onChange={(v) => setP({ pivot: [p.pivot[0], p.pivot[1], fromMM(v)] })} />
        <NumberField label="Pitch limit θp,max" unit="°" value={toDeg(p.thetaPMax)} min={0} max={90} step={1} onChange={(v) => setP({ thetaPMax: fromDeg(v) })} />
        <NumberField label="Tilt limit β_max" unit="°" value={toDeg(p.betaMax)} min={0} max={90} step={1} onChange={(v) => setP({ betaMax: fromDeg(v) })} />
      </Section>
      <Appearance v={p} set={(q) => setP(q)} />
    </>
  );
}

function PayloadPanel({ p, update, select }: { p: PayloadComponent; update: (f: (c: RobotConfig) => RobotConfig) => void; select: (id: string) => void }) {
  const set = (f: (x: PayloadComponent) => PayloadComponent) => update((c) => ({ ...c, payloads: c.payloads.map((x) => (x.id === p.id ? f(x) : x)) }));
  const vol = shapeVolume(p.shape);
  const kinds: ShapeKind[] = ['point', 'solidSphere', 'hollowSphere', 'box', 'cylinder', 'tube'];
  return (
    <>
      <Section title="Payload">
        <TextField label="Name" value={p.name} onChange={(name) => set((x) => ({ ...x, name }))} />
        <Select
          label="Mount"
          value={p.mount}
          options={[
            { value: 'frame', label: 'Frame (pitches with θp in arch A)' },
            { value: 'pendulum', label: 'Pendulum (pitches and tilts)' },
            { value: 'shell', label: 'Shell (spins with roll ψ)' },
          ]}
          onChange={(mount: Mount) => set((x) => ({ ...x, mount }))}
        />
        <Select label="Shape" value={p.shape.kind} options={kinds.map((k) => ({ value: k, label: SHAPE_LABELS[k] }))} onChange={(k) => set((x) => withShape(x, defaultShape(k)))} />
        <ShapeFields shape={p.shape} onChange={(s) => set((x) => withShape(x, s))} />
      </Section>
      <Section title="Mass">
        <Select
          label="Scale mode"
          value={p.scaleMode}
          options={[
            { value: 'fixedMass', label: 'Fixed mass (scaling changes inertia only)' },
            { value: 'fixedDensity', label: 'Fixed density (mass follows volume)' },
          ]}
          onChange={(scaleMode) => set((x) => ({ ...x, scaleMode, density: vol > 0 ? x.mass / vol : x.density }))}
        />
        <NumberField label="Mass" unit="kg" value={p.mass} min={0} step={0.01} onChange={(m) => set((x) => withMass(x, m))} />
        <NumberField
          label="Density"
          unit="kg/m³"
          value={effectiveDensity(p)}
          min={0}
          step={10}
          digits={1}
          disabled={vol <= 0}
          onChange={(rho) => set((x) => ({ ...x, density: rho, mass: rho * vol }))}
        />
        <div className="hint">Volume {fmt(vol * 1e9, 0)} mm³</div>
      </Section>
      <Section title={`Pose (in the ${p.mount} frame)`}>
        <Vec3Field label="Position" unit="mm" value={mmV(p.position)} onChange={(v) => set((x) => ({ ...x, position: mV(v) }))} />
        <Vec3Field label="Rotation (XYZ Euler)" unit="°" value={degV(p.rotation)} onChange={(v) => set((x) => ({ ...x, rotation: radV(v) }))} />
      </Section>
      <Appearance v={p} set={(q) => set((x) => ({ ...x, ...q }))} />
      <div className="row-wrap">
        <button
          onClick={() => {
            const id = newId();
            update((c) => ({ ...c, payloads: [...c.payloads, { ...p, id, name: `${p.name} copy`, position: [p.position[0], p.position[1] + 0.01, p.position[2]] }] }));
            select(id);
          }}
        >
          Duplicate
        </button>
        <button
          className="danger"
          onClick={() => {
            update((c) => ({ ...c, payloads: c.payloads.filter((x) => x.id !== p.id) }));
            select(ROBOT_ID);
          }}
        >
          Delete
        </button>
      </div>
    </>
  );
}

export function PropertyPanel() {
  const c = useStore((s) => s.config);
  const selection = useStore((s) => s.selection);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);

  let body;
  if (selection === SHELL_ID) {
    const s = c.shell;
    const setS = (q: Partial<RobotConfig['shell']>) => update((c) => ({ ...c, shell: { ...c.shell, ...q } }));
    body = (
      <>
        <Section title="Shell (thick spherical shell)">
          <NumberField label="Outer radius R" unit="mm" value={toMM(s.outerRadius)} min={1} step={1} title="Also draggable in the 3D view" onChange={(v) => setS({ outerRadius: fromMM(v) })} />
          <NumberField label="Wall thickness t" unit="mm" value={toMM(s.thickness)} min={0} max={toMM(s.outerRadius)} step={0.5} onChange={(v) => setS({ thickness: fromMM(v) })} />
          <NumberField label="Mass" unit="kg" value={s.mass} min={0} step={0.01} onChange={(mass) => setS({ mass })} />
        </Section>
        <Appearance v={s} set={setS} />
      </>
    );
  } else if (selection === AXLE_ID) {
    const a = c.axle;
    const setA = (q: Partial<RobotConfig['axle']>) => update((c) => ({ ...c, axle: { ...c.axle, ...q } }));
    body = (
      <>
        <Section title="Axle (solid cylinder along y)">
          <NumberField label="Mass" unit="kg" value={a.mass} min={0} step={0.01} onChange={(mass) => setA({ mass })} />
          <NumberField label="Radius" unit="mm" value={toMM(a.radius)} min={0} step={0.5} onChange={(v) => setA({ radius: fromMM(v) })} />
          <NumberField label="Length" unit="mm" value={toMM(a.length)} min={0} step={1} onChange={(v) => setA({ length: fromMM(v) })} />
        </Section>
        <Appearance v={a} set={setA} />
      </>
    );
  } else if (selection === FRAMEBOX_ID) {
    const f = c.frameBox;
    const setF = (q: Partial<RobotConfig['frameBox']>) => update((c) => ({ ...c, frameBox: { ...c.frameBox, ...q } }));
    body = (
      <>
        <Section title="Frame box (yoke)">
          <Toggle label="Enabled" checked={f.enabled} onChange={(enabled) => setF({ enabled })} />
          <NumberField label="Mass" unit="kg" value={f.mass} min={0} step={0.01} onChange={(mass) => setF({ mass })} />
          <Vec3Field label="Size" unit="mm" value={mmV(f.size)} onChange={(v) => setF({ size: mV(v) })} />
          <Vec3Field label="Position" unit="mm" value={mmV(f.position)} onChange={(v) => setF({ position: mV(v) })} />
          <Vec3Field label="Rotation (XYZ Euler)" unit="°" value={degV(f.rotation)} onChange={(v) => setF({ rotation: radV(v) })} />
        </Section>
        <Appearance v={f} set={setF} />
      </>
    );
  } else if (selection === BOB_ID || selection === '__arm') {
    body = <PendulumPanel c={c} update={update} />;
  } else {
    const p = c.payloads.find((x) => x.id === selection);
    body = p ? <PayloadPanel p={p} update={update} select={select} /> : <RobotPanel c={c} update={update} />;
  }
  return <div className="props">{body}</div>;
}
