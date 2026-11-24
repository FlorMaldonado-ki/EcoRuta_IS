/**
 * Estado local de la sesión: solo lo que la API todavía no maneja.
 *   - ruta habitual del conductor y sus puntos de encuentro
 *   - vista previa de la foto recién tomada (la definitiva viene en UserDTO.photoUrl)
 * Todo se borra al cerrar sesión con resetLocalState().
 */
import type { DriverRoute, MeetingPoint } from '../types/api';

let currentDriverRoute: DriverRoute | null = null;
let currentDriverPhotoUrl: string | null = null;

export function resetLocalState() {
  currentDriverRoute = null;
  currentDriverPhotoUrl = null;
}

export function saveDriverPhoto(photoUrl: string) {
  currentDriverPhotoUrl = photoUrl;
}

export function getDriverPhoto(): string | null {
  return currentDriverPhotoUrl;
}

export function saveDriverRoute(route: DriverRoute) {
  currentDriverRoute = route;
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
  return currentDriverRoute;
}
