/**
 * Carga datos de la API al montar y cada vez que cambia `fetcher` (p. ej. un filtro).
 * El estado solo se actualiza en el callback de la promesa, nunca de forma síncrona
 * dentro del efecto, y una respuesta vieja se ignora si llegó otra petición después.
 *
 *   const fetcher = useCallback((page) => getAlgo({ filtro, page }), [filtro]);
 *   const { loading, error, load, setLoading } = useLoader(fetcher, (data, page) => setItems(...));
 *   load(2)         → otra página;  load() → recargar
 *   setLoading(true) junto con el cambio de filtro para mostrar el aviso de carga.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/tripService';

export function useLoader<T>(fetcher: (page: number) => Promise<T>, apply: (data: T, page: number) => void) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const applyRef = useRef(apply);
  const turno = useRef(0);

  useEffect(() => {
    applyRef.current = apply;
  });

  const run = useCallback((page: number) => {
    const mio = ++turno.current;
    return fetcher(page).then(
      (data) => {
        if (mio !== turno.current) return;
        applyRef.current(data, page);
        setError(null);
      },
      (err) => {
        if (mio === turno.current) setError(errorMessage(err));
      },
    ).finally(() => {
      if (mio === turno.current) setLoading(false);
    });
  }, [fetcher]);

  useEffect(() => {
    run(1);
    return () => { turno.current += 1; };
  }, [run]);

  const load = useCallback((page = 1) => {
    setLoading(true);
    setError(null);
    return run(page);
  }, [run]);

  return { loading, setLoading, error, load };
}
