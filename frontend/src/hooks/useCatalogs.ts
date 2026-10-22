import { useEffect, useState } from 'react';
import { getCatalogs } from '../services/catalogService';
import { TECNM_MORELIA_CAREERS, TECNM_MORELIA_DEPARTMENTS } from '../constants/options';

/**
 * Catálogos del formulario. Arranca con las listas locales (options.ts) para
 * que el formulario funcione al instante y sin conexión, y las reemplaza por
 * las de la API (fuente única: tabla parametro) en cuanto responde.
 */
export function useCatalogs() {
  const [careers, setCareers] = useState<readonly string[]>(TECNM_MORELIA_CAREERS);
  const [departments, setDepartments] = useState<readonly string[]>(TECNM_MORELIA_DEPARTMENTS);
  const [fromServer, setFromServer] = useState(false);

  useEffect(() => {
    let active = true;
    getCatalogs()
      .then((c) => {
        if (!active) return;
        if (c.careers.length) setCareers(c.careers);
        if (c.departments.length) setDepartments(c.departments);
        setFromServer(true);
      })
      .catch(() => {
        /* sin conexión: se quedan las listas locales */
      });
    return () => {
      active = false;
    };
  }, []);

  return { careers, departments, fromServer };
}
