import { AXLE_ID, BOB_ID, FRAMEBOX_ID, SHELL_ID } from '../physics/massProps';
import { makePayload, newId } from '../physics/payload';
import type { ShapeKind } from '../physics/primitives';
import { ROBOT_ID, useStore } from '../state/store';

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  point: 'Point mass',
  solidSphere: 'Solid sphere',
  hollowSphere: 'Hollow sphere',
  box: 'Box',
  cylinder: 'Solid cylinder',
  tube: 'Tube',
  rod: 'Slender rod',
};
const ADDABLE: ShapeKind[] = ['point', 'solidSphere', 'hollowSphere', 'box', 'cylinder', 'tube'];
const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#b07aa1', '#edc948', '#76b7b2', '#ff9da7', '#9c755f'];

export function ComponentTree() {
  const config = useStore((s) => s.config);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);

  const row = (id: string, label: string, tag?: string, dim = false) => (
    <li key={id}>
      <button className={`tree-row ${selection === id ? 'selected' : ''} ${dim ? 'dim' : ''}`} onClick={() => select(id)}>
        <span>{label}</span>
        {tag && <span className="tag">{tag}</span>}
      </button>
    </li>
  );

  const add = (kind: ShapeKind) => {
    const id = newId();
    update((c) => ({
      ...c,
      payloads: [
        ...c.payloads,
        makePayload(kind, { id, name: `${SHAPE_LABELS[kind]} ${c.payloads.length + 1}`, mount: 'frame', color: PALETTE[c.payloads.length % PALETTE.length] }),
      ],
    }));
    select(id);
  };

  return (
    <div className="tree">
      <h3>Components</h3>
      <ul>
        {row(ROBOT_ID, 'Robot & drive settings')}
        {row(SHELL_ID, 'Shell', 'shell', !config.shell.included)}
        {row(AXLE_ID, 'Axle', 'frame', !config.axle.included)}
        {row(FRAMEBOX_ID, 'Frame box', config.frameBox.enabled ? 'frame' : 'off', !config.frameBox.enabled || !config.frameBox.included)}
        {row(BOB_ID, 'Pendulum', 'pendulum', !config.pendulum.included)}
      </ul>
      <h4>Payloads ({config.payloads.length})</h4>
      <ul>{config.payloads.map((p) => row(p.id, p.name, p.mount, !p.included))}</ul>
      <label className="field add-row">
        <span className="field-label">Add</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) add(e.target.value as ShapeKind);
          }}
        >
          <option value="">+ payload…</option>
          {ADDABLE.map((k) => (
            <option key={k} value={k}>
              {SHAPE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
