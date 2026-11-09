/**
 * Display units. Physics is SI internally; the UI shows every length in millimetres,
 * angles in degrees, inertia in kg·mm² (the CAD convention), mass in kg.
 */
export const MM = 1000;
export const toMM = (m: number) => m * MM;
export const fromMM = (mm: number) => mm / MM;
export const toDeg = (r: number) => (r * 180) / Math.PI;
export const fromDeg = (d: number) => (d * Math.PI) / 180;
/** kg·m² → kg·mm² */
export const toKgMM2 = (i: number) => i * 1e6;
export const rpmToRadS = (rpm: number) => (rpm * 2 * Math.PI) / 60;
export const radSToRpm = (w: number) => (w * 60) / (2 * Math.PI);

export function fmt(x: number, digits = 2): string {
  if (x === Infinity) return '∞';
  if (x === -Infinity) return '−∞';
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) < 1e-9) x = 0;
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(3);
  return x.toFixed(digits);
}
export const fmtMM = (m: number, d = 1) => `${fmt(toMM(m), d)} mm`;
export const fmtDeg = (r: number, d = 2) => `${fmt(toDeg(r), d)}°`;
export const fmtKgMM2 = (i: number, d = 1) => `${fmt(toKgMM2(i), d)} kg·mm²`;
