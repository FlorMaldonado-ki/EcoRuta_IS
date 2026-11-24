/**
 * Persistencia de la sesión en el navegador (Expo Web).
 *
 * Sin esto, recargar la página borraba el token (vivía solo en memoria) y la app
 * regresaba al inicio de sesión. En web se guarda en localStorage; al abrir la
 * app se valida contra GET /api/me y, si ya no sirve (401), se borra.
 *
 * En Android/iOS la app no se "recarga" como una página: la sesión sigue en
 * memoria mientras la app está abierta (persistirla ahí requeriría expo-secure-store).
 *
 * localStorage puede no existir o lanzar error (modo privado, cuota llena):
 * todas las lecturas y escrituras están protegidas y fallan en silencio.
 */
import { Platform } from 'react-native';
import type { DriverRoute } from '../types/api';

const CLAVE_TOKEN = 'ecoruta.sesion.token';
const CLAVE_RUTA = 'ecoruta.sesion.ruta';

function almacen(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function leer(clave: string): string | null {
  try {
    return almacen()?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string | null) {
  try {
    const s = almacen();
    if (!s) return;
    if (valor === null) s.removeItem(clave);
    else s.setItem(clave, valor);
  } catch {
    // sin almacenamiento disponible: la sesión sigue funcionando en memoria
  }
}

/** ¿Este entorno puede recordar la sesión al recargar? */
export const puedePersistirSesion = () => almacen() !== null;

export const guardarToken = (token: string) => escribir(CLAVE_TOKEN, token);
export const leerToken = () => leer(CLAVE_TOKEN);

/** Ruta habitual del conductor ligada al usuario (otra cuenta en el mismo navegador no la ve). */
export function guardarRuta(usuarioId: string, ruta: DriverRoute | null) {
  escribir(CLAVE_RUTA, ruta ? JSON.stringify({ usuarioId, ruta }) : null);
}

export function leerRuta(usuarioId: string): DriverRoute | null {
  const crudo = leer(CLAVE_RUTA);
  if (!crudo) return null;
  try {
    const dato = JSON.parse(crudo) as { usuarioId?: string; ruta?: DriverRoute };
    return dato.usuarioId === usuarioId && dato.ruta ? dato.ruta : null;
  } catch {
    return null;
  }
}

/** Cerrar sesión o sesión vencida: no queda nada en el navegador. */
export function borrarSesion() {
  escribir(CLAVE_TOKEN, null);
  escribir(CLAVE_RUTA, null);
}
