/**
 * SCRUM-68 · RF-26: estado compartido del impacto ecológico.
 *
 * El inicio (tarjeta comunitaria) y "Mi impacto" leen de aquí. Al finalizar un
 * viaje se llama a `invalidate()` y ambos muestran el valor nuevo sin cerrar la
 * app ("tiempo real" del ERS = actualización inmediata, sin rastreo GPS).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCommunityImpact, getMyImpact } from '../services/catalogService';
import { errorMessage } from '../services/tripService';
import type { CommunityImpactDTO, MyImpactDTO } from '../types/api';

type Status = 'loading' | 'ready' | 'error';

interface ImpactContextValue {
  community: CommunityImpactDTO | null;
  communityStatus: Status;
  communityError: string | null;
  mine: MyImpactDTO | null;
  mineStatus: Status;
  mineError: string | null;
  /** Aumenta cada vez que se invalida: las pantallas con listas propias lo usan para recargar. */
  version: number;
  /** Vuelve a pedir los totales (p. ej. al regresar al inicio). */
  refresh: () => Promise<void>;
  /** Algo cambió el impacto (se finalizó un viaje): recarga todo. */
  invalidate: () => void;
}

const ImpactContext = createContext<ImpactContextValue | null>(null);

export const ImpactProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [community, setCommunity] = useState<CommunityImpactDTO | null>(null);
  const [communityStatus, setCommunityStatus] = useState<Status>('loading');
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyImpactDTO | null>(null);
  const [mineStatus, setMineStatus] = useState<Status>('loading');
  const [mineError, setMineError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async () => {
    // Se conserva el último valor mientras carga, para que la tarjeta no "parpadee".
    setCommunityStatus((s) => (s === 'ready' ? s : 'loading'));
    setMineStatus((s) => (s === 'ready' ? s : 'loading'));
    const [c, m] = await Promise.allSettled([getCommunityImpact(), getMyImpact()]);
    if (!mounted.current) return;
    if (c.status === 'fulfilled') {
      setCommunity(c.value); setCommunityStatus('ready'); setCommunityError(null);
    } else {
      setCommunityStatus('error'); setCommunityError(errorMessage(c.reason));
    }
    if (m.status === 'fulfilled') {
      setMine(m.value); setMineStatus('ready'); setMineError(null);
    } else {
      setMineStatus('error'); setMineError(errorMessage(m.reason));
    }
  }, []);

  const invalidate = useCallback(() => {
    setVersion((v) => v + 1);
    refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<ImpactContextValue>(() => ({
    community, communityStatus, communityError, mine, mineStatus, mineError, version, refresh, invalidate,
  }), [community, communityStatus, communityError, mine, mineStatus, mineError, version, refresh, invalidate]);

  return <ImpactContext.Provider value={value}>{children}</ImpactContext.Provider>;
};

export function useImpact(): ImpactContextValue {
  const ctx = useContext(ImpactContext);
  if (!ctx) throw new Error('useImpact debe usarse dentro de <ImpactProvider>');
  return ctx;
}
