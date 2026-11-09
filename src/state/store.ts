/**
 * One zustand store holding the RobotConfig, the selection, view options and a simple undo/redo history.
 * Every physics output is derived from `config` (see useResults in ui/hooks.ts).
 *
 * Gestures (dragging a gizmo or handle) are grouped into a single undo step:
 * beginGesture() snapshots once, updates during the gesture are not recorded, endGesture() closes it.
 */
import { create } from 'zustand';
import type { RobotConfig } from '../physics/types';
import { parseConfig, serializeConfig } from './io';
import { smallDemoBot } from './presets';

/** Browser-local autosave (per-viewer convenience only; files are the real persistence). */
const AUTOSAVE_KEY = 'spherical-robot-sim:autosave';
function restore(): RobotConfig {
  try {
    const t = localStorage.getItem(AUTOSAVE_KEY);
    if (t) return parseConfig(t).config;
  } catch {
    /* storage blocked or stale/invalid save: fall back to the demo */
  }
  return smallDemoBot();
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function autosave(c: RobotConfig) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeConfig(c));
    } catch {
      /* ignore */
    }
  }, 500);
}

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface ViewOptions {
  showLean: boolean;
  showPrincipal: boolean;
  showEllipsoid: boolean;
  showSubComs: boolean;
  showLabels: boolean;
  gizmoMode: GizmoMode;
}

export const ROBOT_ID = '__robot';

/** Sweep settings for charts 3–5 (SI values; `key` from listSweepParams). Not part of undo history. */
export interface SweepSettings {
  key: string;
  from: number;
  to: number;
  steps: number;
}

export type ChartTab = 'turning' | 'torque' | 'trim' | 'com' | 'principal' | 'pitch';

interface State {
  config: RobotConfig;
  selection: string;
  view: ViewOptions;
  past: RobotConfig[];
  future: RobotConfig[];
  gesture: boolean;
  /** Incremented whenever a whole config is loaded (preset, file); the viewport refits the camera. */
  loadCount: number;
  sweep: SweepSettings | null;
  chartTab: ChartTab;
  /** Message banner (load errors, notes). */
  message: { kind: 'error' | 'info'; text: string } | null;
  setMessage: (m: State['message']) => void;
  setSweep: (s: SweepSettings | null) => void;
  setChartTab: (t: ChartTab) => void;
  update: (fn: (c: RobotConfig) => RobotConfig) => void;
  setConfig: (c: RobotConfig) => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: string) => void;
  setView: (v: Partial<ViewOptions>) => void;
}

const HISTORY_LIMIT = 200;

export const useStore = create<State>((set, get) => ({
  config: restore(),
  selection: ROBOT_ID,
  view: { showLean: true, showPrincipal: true, showEllipsoid: false, showSubComs: true, showLabels: true, gizmoMode: 'translate' },
  past: [],
  future: [],
  gesture: false,
  loadCount: 0,
  sweep: null,
  chartTab: 'turning',
  message: null,
  setMessage: (message) => set({ message }),
  setSweep: (sweep) => set({ sweep }),
  setChartTab: (chartTab) => set({ chartTab }),
  update: (fn) => {
    const { config, gesture, past } = get();
    const next = fn(config);
    if (next === config) return;
    set(gesture ? { config: next } : { config: next, past: [...past, config].slice(-HISTORY_LIMIT), future: [] });
  },
  setConfig: (c) =>
    set((s) => ({ config: c, past: [...s.past, s.config].slice(-HISTORY_LIMIT), future: [], selection: ROBOT_ID, loadCount: s.loadCount + 1 })),
  beginGesture: () => {
    const { gesture, past, config } = get();
    if (gesture) return;
    set({ gesture: true, past: [...past, config].slice(-HISTORY_LIMIT), future: [] });
  },
  endGesture: () => set({ gesture: false }),
  undo: () => {
    const { past, config, future } = get();
    if (!past.length) return;
    set({ config: past[past.length - 1], past: past.slice(0, -1), future: [config, ...future], gesture: false });
  },
  redo: () => {
    const { past, config, future } = get();
    if (!future.length) return;
    set({ config: future[0], future: future.slice(1), past: [...past, config], gesture: false });
  },
  select: (id) => set({ selection: id }),
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
}));

useStore.subscribe((s, prev) => {
  if (s.config !== prev.config) autosave(s.config);
});
