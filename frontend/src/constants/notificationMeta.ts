/**
 * Apariencia y destino de cada aviso. Lo comparten la alerta superior, la bandeja
 * y las insignias del panel para que todo se vea igual en la app.
 */
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from './theme';
import type { NotificationType } from '../types/api';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Secciones del panel que muestran insignia. */
export type NotifSection = 'search' | 'myTrips' | 'requests';

export const SECTION_LABEL: Record<NotifSection, string> = {
  search: 'Buscar viajes',
  myTrips: 'Mis viajes',
  requests: 'Solicitudes',
};

/** Tipos de aviso que se dan por vistos al abrir cada sección. */
export const SECTION_TYPES: Record<Exclude<NotifSection, 'search'>, NotificationType[]> = {
  myTrips: [
    'solicitud_aceptada', 'solicitud_rechazada', 'viaje_cancelado', 'lugar_cancelado', 'solicitud_cancelada',
    'viaje_lleno', 'lugar_liberado',
  ],
  requests: ['solicitud_recibida'],
};

export interface NotificationMeta {
  icon: IconName;
  color: string;      // color principal del aviso
  tint: string;       // fondo suave del icono
  label: string;      // etiqueta corta
  section: NotifSection;
}

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  solicitud_recibida: {
    icon: 'account-plus', color: THEME.colors.primary, tint: THEME.colors.primarySoft,
    label: 'Nueva solicitud', section: 'requests',
  },
  solicitud_aceptada: {
    icon: 'check-decagram', color: THEME.colors.success, tint: THEME.colors.successBg,
    label: 'Lugar confirmado', section: 'myTrips',
  },
  solicitud_rechazada: {
    icon: 'close-octagon', color: THEME.colors.error, tint: THEME.colors.errorBg,
    label: 'Rechazada', section: 'myTrips',
  },
  solicitud_cancelada: {
    icon: 'account-cancel', color: THEME.colors.error, tint: THEME.colors.errorBg,
    label: 'Solicitud retirada', section: 'myTrips',
  },
  lugar_cancelado: {
    icon: 'seat-passenger', color: THEME.colors.error, tint: THEME.colors.errorBg,
    label: 'Lugar cancelado', section: 'myTrips',
  },
  viaje_cancelado: {
    icon: 'car-off', color: THEME.colors.error, tint: THEME.colors.errorBg,
    label: 'Viaje cancelado', section: 'myTrips',
  },
  viaje_lleno: {
    icon: 'account-clock', color: THEME.colors.warning, tint: THEME.colors.warningBg,
    label: 'Lista de espera', section: 'myTrips',
  },
  lugar_liberado: {
    icon: 'seat-passenger', color: THEME.colors.success, tint: THEME.colors.successBg,
    label: 'Lugar liberado', section: 'myTrips',
  },
};

/** Tonos de las alertas superiores (las de acciones propias y los viajes nuevos no vienen de la bandeja). */
export type AlertTone = 'critical' | 'warning' | 'success' | 'info' | 'trip';

export const TONE_META: Record<AlertTone, { color: string; tint: string; icon: IconName; label: string }> = {
  critical: { color: THEME.colors.error, tint: THEME.colors.errorBg, icon: 'alert-octagon', label: 'Aviso importante' },
  warning: { color: THEME.colors.warning, tint: THEME.colors.warningBg, icon: 'alert', label: 'Atención' },
  success: { color: THEME.colors.success, tint: THEME.colors.successBg, icon: 'check-decagram', label: 'Listo' },
  info: { color: THEME.colors.primary, tint: THEME.colors.primarySoft, icon: 'bell-ring', label: 'Notificación' },
  trip: { color: THEME.colors.accentDark, tint: '#FDF8E8', icon: 'car-arrow-right', label: 'Nuevo viaje' },
};

/** "Hace 5 min" */
export function relativeTime(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} día${d > 1 ? 's' : ''}`;
}
