/** Small form controls. Numeric fields take and emit DISPLAY units (mm, deg, …); callers convert. */
import { useEffect, useState, type ReactNode } from 'react';
import type { Vec3 } from '../physics/vec';

interface NumberFieldProps {
  label: ReactNode;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  title?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

const clean = (v: number, digits: number) => (Number.isFinite(v) ? String(+v.toFixed(digits)) : '');

/** Commits on Enter, blur, or spinner/arrow keys; Escape reverts. Invalid input is ignored. */
export function NumberField({ label, value, unit, step = 1, min, max, digits = 4, title, disabled, onChange }: NumberFieldProps) {
  const [text, setText] = useState(clean(value, digits));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(clean(value, digits));
  }, [value, digits, focused]);
  const commit = (t: string) => {
    const v = parseFloat(t);
    if (!Number.isFinite(v)) return setText(clean(value, digits));
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (c !== value) onChange(c);
    setText(clean(c, digits));
  };
  return (
    <label className="field" title={title}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={text}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onChange={(e) => {
            setText(e.target.value);
            // spinner clicks fire change without focus typing; commit them immediately
            const ne = e.nativeEvent as InputEvent;
            if (!ne.inputType) commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setText(clean(value, digits));
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

export function Vec3Field({
  label, value, unit, step, digits, onChange,
}: { label: string; value: Vec3; unit?: string; step?: number; digits?: number; onChange: (v: Vec3) => void }) {
  return (
    <div className="vec3">
      <div className="vec3-label">{label}</div>
      <div className="vec3-row">
        {(['x', 'y', 'z'] as const).map((a, i) => (
          <NumberField
            key={a}
            label={a}
            value={value[i]}
            unit={unit}
            step={step}
            digits={digits}
            onChange={(v) => {
              const n = [...value] as Vec3;
              n[i] = v;
              onChange(n);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, title }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="toggle" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({
  label, value, options, onChange,
}: { label: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
