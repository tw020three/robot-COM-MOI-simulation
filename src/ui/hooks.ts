import { useMemo } from 'react';
import { computeAll, type Results } from '../physics/results';
import { useStore } from '../state/store';

/** All physics outputs, recomputed only when the config object changes. */
export function useResults(): Results {
  const config = useStore((s) => s.config);
  return useMemo(() => computeAll(config), [config]);
}
