/**
 * Estado local de la sesión: solo lo que la API todavía no maneja.
 *   - ruta habitual del conductor y sus puntos de encuentro
 *   - vista previa de la foto recién tomada (la definitiva viene en UserDTO.photoUrl)
 * Todo se borra al cerrar sesión con resetLocalState().
 */
import type { DriverRoute, MeetingPoint } from '../types/api';
import { guardarRuta, leerRuta } from './sessionStorage';

let currentDriverRoute: DriverRoute | null = null;
let currentDriverPhotoUrl: string | null = null;
// Dueño de la ruta: en web se guarda en el navegador para que sobreviva a recargar la página.
let currentUserId: string | null = null;

export function resetLocalState() {
  currentDriverRoute = null;
  currentDriverPhotoUrl = null;
  currentUserId = null;
}

/** Al iniciar (o recuperar) la sesión: carga la ruta que este usuario dejó guardada en el navegador. */
export function loadLocalState(userId: string) {
  currentUserId = userId;
  currentDriverRoute = leerRuta(userId);
}

const persistirRuta = () => {
  if (currentUserId) guardarRuta(currentUserId, currentDriverRoute);
};

export function saveDriverPhoto(photoUrl: string) {
  currentDriverPhotoUrl = photoUrl;
}

export function getDriverPhoto(): string | null {
  return currentDriverPhotoUrl;
}

export function saveDriverRoute(route: DriverRoute) {
  currentDriverRoute = route;
  persistirRuta();
}

export function getDriverRoute(): DriverRoute | null {
  return currentDriverRoute;
}

export function updateRouteMeetingPoints(points: MeetingPoint[]) {
  if (!currentDriverRoute) return null;
  currentDriverRoute = {
    ...currentDriverRoute,
    meetingPoints: points,
    isConfigured: points.length > 0,
    updatedAt: new Date().toISOString(),
  };
  persistirRuta();
  return currentDriverRoute;
}
