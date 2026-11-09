/**
 * Display units. Physics is SI internally. The UI shows geometric lengths in millimetres and angles in
 * degrees; everything else stays SI: inertia kg·m², mass kg, speed m/s, angular speed rad/s,
 * acceleration m/s², angular acceleration rad/s².
 */
export const MM = 1000;
export const toMM = (m: number) => m * MM;
export const fromMM = (mm: number) => mm / MM;
export const toDeg = (r: number) => (r * 180) / Math.PI;
export const fromDeg = (d: number) => (d * Math.PI) / 180;
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
/** n significant figures, plain notation where reasonable. */
export function fmtSig(x: number, n = 4): string {
  if (!Number.isFinite(x)) return fmt(x);
  if (Math.abs(x) < 1e-12) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-4) return x.toExponential(n - 1);
  return String(+x.toPrecision(n));
}
export const fmtInertia = (i: number) => `${fmtSig(i)} kg·m²`;
