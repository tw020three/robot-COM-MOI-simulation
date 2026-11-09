/**
 * 3D view. World coordinates = body frame (x forward, y left, z up), origin at the shell centre O,
 * ground plane at z = −R. The whole robot is drawn leaned by the static lean φ (rotation Rx(−φ)).
 *
 * Draggable handles (lengths shown in mm):
 *  - orange handle on top of the shell: outer radius R
 *  - red handle on the pendulum: CoM radius r_p (sets the arm length via armLengthForRp)
 * The selected payload / frame box gets a translate/rotate/scale gizmo that writes back to the store.
 */
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewport, Grid, Html, Line, OrbitControls, TransformControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { armLengthForRp, AXLE_ID, BOB_ID, equivalentEllipsoid, FRAMEBOX_ID, SHELL_ID } from '../physics/massProps';
import { mulVec, rotX } from '../physics/mat3';
import { scaleShape, withShape } from '../physics/payload';
import type { Shape } from '../physics/primitives';
import type { Mount, PayloadComponent, RobotConfig } from '../physics/types';
import type { Vec3 } from '../physics/vec';
import { ROBOT_ID, useStore } from '../state/store';
import { useResults } from './hooks';
import { fmt, toMM } from './units';

type V3 = [number, number, number];
/** A pointer that moved more than this many pixels between down and up was a drag, not a click. */
const CLICK_SLOP = 4;

/* ------------------------------------------------------------------ shapes */

function ShapeGeometryMesh({
  shape, color, opacity = 1, selected, pointSize, onClick,
}: { shape: Shape; color: string; opacity?: number; selected?: boolean; pointSize: number; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const mat = (
    <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.6} metalness={0.05} depthWrite={opacity >= 1} />
  );
  const edges = selected ? <Edges color="#ffd400" lineWidth={2} threshold={20} /> : null;
  switch (shape.kind) {
    case 'point':
      return (
        <mesh onClick={onClick}>
          <sphereGeometry args={[pointSize, 16, 12]} />
          {mat}
          {edges}
        </mesh>
      );
    case 'solidSphere':
      return (
        <mesh onClick={onClick}>
          <sphereGeometry args={[shape.radius, 32, 16]} />
          {mat}
          {edges}
        </mesh>
      );
    case 'hollowSphere':
      return (
        <mesh onClick={onClick}>
          <sphereGeometry args={[shape.outerRadius, 32, 16]} />
          <meshStandardMaterial color={color} transparent opacity={0.55} depthWrite={false} />
          {edges}
        </mesh>
      );
    case 'box':
      return (
        <mesh onClick={onClick}>
          <boxGeometry args={shape.size} />
          {mat}
          {edges}
        </mesh>
      );
    case 'cylinder':
    case 'tube':
    case 'rod': {
      const r = shape.kind === 'cylinder' ? shape.radius : shape.kind === 'tube' ? shape.outerRadius : Math.max(shape.length * 0.015, pointSize * 0.35);
      // three.js cylinders run along local y; physics cylinders run along local z → rotate +90° about x.
      return (
        <mesh onClick={onClick} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, shape.length, 32]} />
          {shape.kind === 'tube' ? <meshStandardMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} /> : mat}
          {edges}
        </mesh>
      );
    }
  }
}

/* ------------------------------------------------------------------ drag handle */

/**
 * A sphere you can drag along a fixed axis (in its parent's frame). Emits the distance from `origin`
 * along `dir` in metres. The drag plane contains the axis and faces the camera.
 */
function AxisHandle({
  origin = [0, 0, 0], dir, value, min = 0, max = Infinity, size, color, label, onChange,
}: { origin?: V3; dir: V3; value: number; min?: number; max?: number; size: number; color: string; label?: ReactNode; onChange: (v: number) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const drag = useRef<{ o: THREE.Vector3; d: THREE.Vector3 } | null>(null);
  const [hover, setHover] = useState(false);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const camera = useThree((s) => s.camera);
  const beginGesture = useStore((s) => s.beginGesture);
  const endGesture = useStore((s) => s.endGesture);
  const pos: V3 = [origin[0] + dir[0] * value, origin[1] + dir[1] * value, origin[2] + dir[2] * value];

  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    if (controls) controls.enabled = true;
    endGesture();
  };

  return (
    <group>
      <Line points={[origin, pos]} color={color} lineWidth={1.5} dashed dashSize={size} gapSize={size * 0.6} depthTest={false} renderOrder={999} />
      <mesh
        ref={ref}
        position={pos}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          const parent = ref.current?.parent;
          if (!parent) return;
          parent.updateWorldMatrix(true, false);
          const o = new THREE.Vector3(...origin).applyMatrix4(parent.matrixWorld);
          const d = new THREE.Vector3(...dir).transformDirection(parent.matrixWorld);
          drag.current = { o, d };
          (e.target as Element).setPointerCapture?.(e.pointerId);
          if (controls) controls.enabled = false;
          beginGesture();
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          e.stopPropagation();
          const { o, d } = drag.current;
          const camDir = camera.getWorldDirection(new THREE.Vector3());
          let n = new THREE.Vector3().crossVectors(d, new THREE.Vector3().crossVectors(camDir, d));
          if (n.lengthSq() < 1e-12) n = camDir.clone();
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), o);
          const hit = e.ray.intersectPlane(plane, new THREE.Vector3());
          if (!hit) return;
          const t = hit.sub(o).dot(d);
          onChange(Math.min(max, Math.max(min, t)));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        renderOrder={1000}
      >
        <sphereGeometry args={[size * (hover ? 1.3 : 1), 20, 14]} />
        {/* drawn on top of everything so a handle buried inside a part is still visible and grabbable */}
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
      {label && (
        <Html position={pos} className="handle-label" style={{ transform: 'translate(14px, -50%)', pointerEvents: 'none' }}>
          {label}
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ editable objects */

function scaleOf(shape: Shape, s: THREE.Vector3): Shape {
  const u = (s.x + s.y + s.z) / 3;
  switch (shape.kind) {
    case 'box':
      return { ...shape, size: [shape.size[0] * s.x, shape.size[1] * s.y, shape.size[2] * s.z] };
    case 'cylinder':
      return { ...shape, radius: shape.radius * (s.x + s.y) / 2, length: shape.length * s.z };
    case 'tube':
      return { ...shape, outerRadius: shape.outerRadius * (s.x + s.y) / 2, innerRadius: shape.innerRadius * (s.x + s.y) / 2, length: shape.length * s.z };
    default:
      return scaleShape(shape, u);
  }
}

/** A posable object (payload or frame box) with an optional gizmo when selected. */
function Editable({
  id, position, rotation, shape, color, visible, onPose, onShape, pointSize,
}: {
  id: string;
  position: Vec3;
  rotation: Vec3;
  shape: Shape;
  color: string;
  visible: boolean;
  pointSize: number;
  onPose: (p: Vec3, r: Vec3) => void;
  onShape: (s: Shape) => void;
}) {
  const selected = useStore((s) => s.selection === id);
  const select = useStore((s) => s.select);
  const mode = useStore((s) => s.view.gizmoMode);
  const beginGesture = useStore((s) => s.beginGesture);
  const endGesture = useStore((s) => s.endGesture);
  const [obj, setObj] = useState<THREE.Group | null>(null);
  if (!visible && !selected) return null;
  return (
    <>
      <group ref={setObj} position={position} rotation={rotation}>
        <ShapeGeometryMesh
          shape={shape}
          color={color}
          opacity={visible ? 1 : 0.25}
          selected={selected}
          pointSize={pointSize}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta <= CLICK_SLOP) select(id);
          }}
        />
      </group>
      {selected && obj && (
        <TransformControls
          object={obj}
          mode={mode}
          space="local"
          size={0.8}
          onMouseDown={() => beginGesture()}
          onObjectChange={() => {
            if (mode === 'scale') return; // committed on release
            onPose([obj.position.x, obj.position.y, obj.position.z], [obj.rotation.x, obj.rotation.y, obj.rotation.z]);
          }}
          onMouseUp={() => {
            if (mode === 'scale') {
              const s = obj.scale.clone();
              obj.scale.set(1, 1, 1);
              if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) > 1e-9) onShape(scaleOf(shape, s));
            }
            endGesture();
          }}
        />
      )}
    </>
  );
}

function Payloads({ mount, pointSize }: { mount: Mount; pointSize: number }) {
  const payloads = useStore((s) => s.config.payloads);
  const update = useStore((s) => s.update);
  const set = (id: string, f: (p: PayloadComponent) => PayloadComponent) =>
    update((c) => ({ ...c, payloads: c.payloads.map((x) => (x.id === id ? f(x) : x)) }));
  return (
    <>
      {payloads
        .filter((p) => p.mount === mount)
        .map((p) => (
          <Editable
            key={p.id}
            id={p.id}
            position={p.position}
            rotation={p.rotation}
            shape={p.shape}
            color={p.color}
            visible={p.visible}
            pointSize={pointSize}
            onPose={(position, rotation) => set(p.id, (x) => ({ ...x, position, rotation }))}
            onShape={(s) => set(p.id, (x) => withShape(x, s))}
          />
        ))}
    </>
  );
}

/* ------------------------------------------------------------------ robot */

function Pendulum({ cfg, pointSize, comLocal, rP }: { cfg: RobotConfig; pointSize: number; comLocal: Vec3; rP: number }) {
  const p = cfg.pendulum;
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selection === BOB_ID || s.selection === '__arm');
  const update = useStore((s) => s.update);
  const showLabels = useStore((s) => s.view.showLabels);
  const clickSel = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta <= CLICK_SLOP) select(BOB_ID);
  };
  const n = Math.hypot(...comLocal);
  const dir: V3 = n > 1e-9 ? [comLocal[0] / n, comLocal[1] / n, comLocal[2] / n] : [0, 0, -1];
  const R = cfg.shell.outerRadius;
  return (
    <group rotation={[cfg.pose.beta, 0, 0]}>
      {p.visible && (
        <>
          {/* arm: drawn even when massless so the geometry is readable */}
          <group position={[0, 0, -p.armLength / 2]}>
            <ShapeGeometryMesh shape={{ kind: 'rod', length: p.armLength }} color={p.armEnabled ? p.color : '#999999'} pointSize={pointSize} selected={selected} onClick={clickSel} />
          </group>
          <group position={[0, 0, -p.armLength]} rotation={p.bobRotation}>
            <ShapeGeometryMesh shape={p.bobShape} color={p.color} pointSize={pointSize * 1.6} selected={selected} onClick={clickSel} />
          </group>
        </>
      )}
      <Payloads mount="pendulum" pointSize={pointSize} />
      <AxisHandle
        dir={dir}
        value={rP}
        min={0}
        max={R * 1.5}
        size={R * 0.035}
        color="#d62728"
        label={showLabels ? <>r<sub>p</sub> = {fmt(toMM(rP), 1)} mm</> : undefined}
        onChange={(v) => {
          const l = armLengthForRp(cfg, v);
          if (l !== null) update((c) => ({ ...c, pendulum: { ...c.pendulum, armLength: l } }));
        }}
      />
    </group>
  );
}

function Robot() {
  const cfg = useStore((s) => s.config);
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.selection);
  const update = useStore((s) => s.update);
  const view = useStore((s) => s.view);
  const r = useResults();
  const R = cfg.shell.outerRadius;
  const pointSize = R * 0.04;
  const { pose, pendulum: p, shell, axle, frameBox: fb } = cfg;
  const pend = <Pendulum cfg={cfg} pointSize={pointSize} comLocal={r.mass.pendulum.comLocal} rP={r.mass.pendulum.rP} />;
  const sel = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta <= CLICK_SLOP) select(id);
  };
  return (
    <>
      {/* Shell (spins with ψ) */}
      <group rotation={[0, pose.shellRoll, 0]}>
        {shell.visible && (
          <>
            <mesh onClick={sel(SHELL_ID)} renderOrder={10}>
              <sphereGeometry args={[R, 48, 24]} />
              <meshStandardMaterial color={shell.color} transparent opacity={selection === SHELL_ID ? 0.22 : 0.12} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh raycast={() => null}>
              <sphereGeometry args={[R * 1.0005, 24, 12]} />
              <meshBasicMaterial color={selection === SHELL_ID ? '#ffd400' : '#7aa6c2'} wireframe transparent opacity={0.35} />
            </mesh>
            {/* a meridian ring so the roll angle is visible */}
            <Line points={Array.from({ length: 65 }, (_, i) => [R * Math.cos((i / 64) * 2 * Math.PI), 0, R * Math.sin((i / 64) * 2 * Math.PI)] as V3)} color="#1f77b4" lineWidth={2} />
          </>
        )}
        <Payloads mount="shell" pointSize={pointSize} />
      </group>

      {/* Frame (pitches with θp in architecture A) */}
      <group rotation={[0, cfg.architecture === 'A' ? -pose.thetaP : 0, 0]}>
        {axle.visible && (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <ShapeGeometryMesh shape={{ kind: 'cylinder', radius: axle.radius, length: axle.length }} color={axle.color} pointSize={pointSize} selected={selection === AXLE_ID} onClick={sel(AXLE_ID)} />
          </group>
        )}
        {fb.enabled && (
          <Editable
            id={FRAMEBOX_ID}
            position={fb.position}
            rotation={fb.rotation}
            shape={{ kind: 'box', size: fb.size }}
            color={fb.color}
            visible={fb.visible}
            pointSize={pointSize}
            onPose={(position, rotation) => update((c) => ({ ...c, frameBox: { ...c.frameBox, position, rotation } }))}
            onShape={(s) => s.kind === 'box' && update((c) => ({ ...c, frameBox: { ...c.frameBox, size: s.size } }))}
          />
        )}
        <Payloads mount="frame" pointSize={pointSize} />
        {cfg.architecture === 'A' && <group position={p.pivot}>{pend}</group>}
      </group>
      {cfg.architecture === 'B' && (
        <group position={p.pivot}>
          <group rotation={[0, -pose.thetaP, 0]}>{pend}</group>
        </group>
      )}

      {/* Outer-radius handle */}
      <AxisHandle
        dir={[0, 0, 1]}
        value={R}
        min={Math.max(0.005, shell.thickness + 0.001)}
        size={R * 0.035}
        color="#ff7f0e"
        label={view.showLabels ? <>R = {fmt(toMM(R), 1)} mm</> : undefined}
        onChange={(v) => update((c) => ({ ...c, shell: { ...c.shell, outerRadius: v } }))}
      />
    </>
  );
}

/* ------------------------------------------------------------------ markers */

function Markers() {
  const r = useResults();
  const cfg = useStore((s) => s.config);
  const view = useStore((s) => s.view);
  const R = cfg.shell.outerRadius;
  const m = r.mass;
  const com = m.total.com as V3;
  const ell = useMemo(() => {
    const semi = equivalentEllipsoid(m.principal, m.total.mass);
    const [e1, e2, e3] = m.principal.axes.map((a) => new THREE.Vector3(...a));
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3));
    return { semi, q };
  }, [m]);
  const axisColors = ['#e41a1c', '#4daf4a', '#377eb8'];
  const L = R * 0.55;
  const sub: { p: Vec3; color: string; label: string; show: boolean }[] = [
    { p: m.shellGroup.com, color: '#1f77b4', label: 'shell CoM', show: m.shellGroup.mass > 0 },
    { p: m.inner.com, color: '#2ca02c', label: 'inner CoM', show: m.inner.mass > 0 },
    // pendulum CoM: marked by the red r_p handle
  ];
  return (
    <>
      {/* O and body axes */}
      <mesh raycast={() => null}>
        <sphereGeometry args={[R * 0.015, 12, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Line points={[[0, 0, 0], [R * 0.3, 0, 0]]} color="#e41a1c" lineWidth={1.5} />
      <Line points={[[0, 0, 0], [0, R * 0.3, 0]]} color="#4daf4a" lineWidth={1.5} />
      <Line points={[[0, 0, 0], [0, 0, R * 0.3]]} color="#377eb8" lineWidth={1.5} />
      {view.showLabels && (
        <Html position={[0, 0, 0]} className="marker-label" style={{ transform: 'translate(6px, 2px)', pointerEvents: 'none' }}>
          O
        </Html>
      )}
      {/* combined CoM */}
      <mesh position={com} raycast={() => null} renderOrder={20}>
        <sphereGeometry args={[R * 0.045, 24, 16]} />
        <meshStandardMaterial color="#111111" emissive="#ffcc00" emissiveIntensity={0.35} />
      </mesh>
      {view.showLabels && (
        <Html position={com} className="marker-label strong" style={{ transform: 'translate(10px, -6px)', pointerEvents: 'none' }}>
          CoM
        </Html>
      )}
      {view.showSubComs &&
        sub
          .filter((s) => s.show)
          .map((s) => (
            <group key={s.label}>
              <mesh position={s.p as V3} raycast={() => null}>
                <sphereGeometry args={[R * 0.02, 12, 8]} />
                <meshBasicMaterial color={s.color} />
              </mesh>
              {view.showLabels && (
                <Html position={s.p as V3} className="marker-label small" style={{ transform: 'translate(6px, 4px)', pointerEvents: 'none', color: s.color }}>
                  {s.label}
                </Html>
              )}
            </group>
          ))}
      {view.showPrincipal &&
        m.principal.axes.map((a, i) => (
          <group key={i}>
            <Line points={[[com[0] - a[0] * L, com[1] - a[1] * L, com[2] - a[2] * L], [com[0] + a[0] * L, com[1] + a[1] * L, com[2] + a[2] * L]]} color={axisColors[i]} lineWidth={2} dashed dashSize={R * 0.04} gapSize={R * 0.02} />
            {view.showLabels && (
              <Html position={[com[0] + a[0] * L, com[1] + a[1] * L, com[2] + a[2] * L]} className="marker-label small" style={{ color: axisColors[i], pointerEvents: 'none' }}>
                I{['₁', '₂', '₃'][i]}
              </Html>
            )}
          </group>
        ))}
      {view.showEllipsoid && (
        <mesh position={com} quaternion={ell.q} scale={ell.semi} raycast={() => null}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color="#9467bd" wireframe transparent opacity={0.5} />
        </mesh>
      )}
    </>
  );
}

function PlumbLine() {
  const r = useResults();
  const R = useStore((s) => s.config.shell.outerRadius);
  const showLean = useStore((s) => s.view.showLean);
  const phi = showLean ? r.trim.lean : 0;
  const w = mulVec(rotX(-phi), r.mass.total.com) as V3;
  return (
    <>
      <Line points={[w, [w[0], w[1], -R]]} color="#222222" lineWidth={1.5} dashed dashSize={R * 0.03} gapSize={R * 0.02} />
      <mesh position={[w[0], w[1], -R + 0.0005]} raycast={() => null}>
        <circleGeometry args={[R * 0.03, 24]} />
        <meshBasicMaterial color="#222222" />
      </mesh>
      <mesh position={[0, 0, -R + 0.0004]} raycast={() => null}>
        <ringGeometry args={[R * 0.04, R * 0.05, 32]} />
        <meshBasicMaterial color="#1f77b4" />
      </mesh>
    </>
  );
}

/* ------------------------------------------------------------------ canvas */

/**
 * Keeps the camera framed on the robot: refits on every config load, and after a radius change of more
 * than ~1.6× once any drag gesture has ended (so dragging the R handle never makes the view jump mid-drag).
 */
function CameraFitter() {
  const R = useStore((s) => s.config.shell.outerRadius);
  const gesture = useStore((s) => s.gesture);
  const loadCount = useStore((s) => s.loadCount);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const fitted = useRef(R);
  const fit = () => {
    camera.position.set(R * 3.2, R * 2.4, R * 1.8);
    camera.near = R * 0.01;
    camera.far = R * 400;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
    fitted.current = R;
  };
  useEffect(() => {
    if (loadCount > 0) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCount]);
  useEffect(() => {
    const k = R / fitted.current;
    if (!gesture && (k > 1.6 || k < 0.6)) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R, gesture]);
  return null;
}

/** Dev-only test hook: project a world point to canvas pixels (used by the Playwright smoke test). */
function DevProbe() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__project = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
    };
    (window as unknown as Record<string, unknown>).__store = useStore;
  }
  return null;
}

function Scene() {
  const R = useStore((s) => s.config.shell.outerRadius);
  const showLean = useStore((s) => s.view.showLean);
  const r = useResults();
  const phi = showLean ? r.trim.lean : 0;
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, -2, 5]} intensity={1.6} />
      <directionalLight position={[-3, 4, 2]} intensity={0.5} />
      <Grid
        position={[0, 0, -R]}
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={0.01}
        sectionSize={0.1}
        cellColor="#c8ccd2"
        sectionColor="#8a929c"
        infiniteGrid
        fadeDistance={Math.max(2, R * 20)}
        followCamera={false}
      />
      <group rotation={[-phi, 0, 0]}>
        <Robot />
        <Markers />
      </group>
      <PlumbLine />
      <OrbitControls makeDefault target={[0, 0, 0]} />
      <DevProbe />
      <CameraFitter />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#e41a1c', '#4daf4a', '#377eb8']} labelColor="#fff" />
      </GizmoHelper>
    </>
  );
}

export function Viewport3D() {
  const select = useStore((s) => s.select);
  const R0 = useMemo(() => useStore.getState().config.shell.outerRadius, []);
  // Mount the scene only once the canvas has connected its event target; otherwise every drei <Html>
  // label creates its React root against a placeholder target and immediately re-creates it.
  const [ready, setReady] = useState(false);
  return (
    <Canvas
      onCreated={() => setReady(true)}
      camera={{ position: [R0 * 3.2, R0 * 2.4, R0 * 1.8], up: [0, 0, 1], fov: 40, near: R0 * 0.01, far: R0 * 400 }}
      onPointerMissed={(e) => {
        if (!useStore.getState().gesture && (e as MouseEvent).button === 0) select(ROBOT_ID);
      }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#f4f6f8']} />
      {ready && <Scene />}
    </Canvas>
  );
}
