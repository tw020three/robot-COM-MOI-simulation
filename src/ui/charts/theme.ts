/**
 * Chart theme. Categorical hues come from the validated reference palette (light mode), assigned in
 * fixed order and never cycled. Text uses ink tokens, never series colours. The app is light-only.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;
export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#8a8985' };
export const SURFACE = '#fcfcfb';
export const GRID = '#e8e7e3';
/** Neutral reference marks (limits, v_max line) — not a categorical slot. */
export const REF = '#7a7975';
export const BAND = 'rgba(82, 81, 78, 0.10)';

import type { Layout } from 'plotly.js-dist-min';

export function baseLayout(xTitle: string, yTitle: string): Partial<Layout> {
  const axis = {
    gridcolor: GRID,
    zeroline: false,
    linecolor: '#c9c8c3',
    tickfont: { color: INK.secondary, size: 11 },
    title: { font: { color: INK.secondary, size: 12 } },
  };
  return {
    paper_bgcolor: SURFACE,
    plot_bgcolor: SURFACE,
    font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: INK.primary, size: 12 },
    margin: { l: 64, r: 16, t: 8, b: 44 },
    hovermode: 'x unified',
    hoverlabel: { bgcolor: '#ffffff', bordercolor: '#c9c8c3', font: { color: INK.primary, size: 12 } },
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: INK.secondary, size: 11 }, bgcolor: 'rgba(0,0,0,0)' },
    xaxis: { ...axis, title: { ...axis.title, text: xTitle } },
    yaxis: { ...axis, title: { ...axis.title, text: yTitle } },
    autosize: true,
  };
}

/** Plotly cannot draw ±∞ or NaN; map them to null so the line breaks instead. */
export const finite = (a: number[]): (number | null)[] => a.map((v) => (Number.isFinite(v) ? v : null));
