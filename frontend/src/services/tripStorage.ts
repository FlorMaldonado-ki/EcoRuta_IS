/**
 * EcoRuta Escolar · Estado local de la sesión (Sprint 2).
 *
 * Solo guarda en memoria lo que la API todavía no maneja:
 *   - ruta habitual del conductor y sus puntos de encuentro
 *   - fotografía del conductor
 *   - copia del vehículo registrado (la fuente real es GET /api/me/vehiculos)
 *
 * Viajes, reservas y notificaciones viven en el backend: ver services/tripService.ts
 * y services/notificationService.ts.
 * Todo se borra al cerrar sesión con resetLocalState().
 */
import type { DriverRoute, MeetingPoint, VehicleDTO } from '../types/api';

let currentDriverRoute: DriverRoute | null = null;
let currentDriverVehicle: VehicleDTO | null = null;
let currentDriverPhotoUrl: string | null = null;

/** Limpia todo el estado local (al cerrar sesión o cambiar de usuario). */
export function resetLocalState() {
  currentDriverRoute = null;
  currentDriverVehicle = null;
  currentDriverPhotoUrl = null;
}

// ============================================================================
// RUTA, VEHÍCULO Y FOTO DEL CONDUCTOR
// ============================================================================

export function saveDriverVehicle(vehicle: VehicleDTO) {
  currentDriverVehicle = vehicle;
}

export function getDriverVehicle(): VehicleDTO | null {
  return currentDriverVehicle;
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
