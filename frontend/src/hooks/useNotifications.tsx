/**
 * Notificaciones en la app: bandeja del backend, insignias por sección y alertas destacadas.
 *
 * - Consulta GET /api/me/notificaciones cada 15 s (y al volver la app a primer plano).
 *   La misma respuesta trae el resumen del panel: viajes nuevos y solicitudes pendientes.
 * - Cada aviso nuevo (o viaje nuevo publicado) aparece como alerta arriba de cualquier
 *   pantalla; las cancelaciones en rojo, con vibración y sin cerrarse solas.
 * - Al abrir una sección del panel (markSectionSeen) su insignia vuelve a 0.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markTripsSeen,
} from '../services/notificationService';
import {
  NOTIFICATION_META,
  SECTION_TYPES,
  type AlertTone,
  type NotifSection,
} from '../constants/notificationMeta';
import type { NotificationItem, NotificationsSummary } from '../types/api';

export type { AlertTone, NotifSection };

export interface AppAlert {
  id: string;
  tone: AlertTone;
  title: string;
  message: string;
  icon?: string;              // nombre de MaterialCommunityIcons; si falta, el del tono
  notificationId?: string;    // si viene de la bandeja, al cerrarla se marca como leída
  section?: NotifSection;     // sección a la que lleva el botón "Ver"
}

export interface SectionBadge {
  count: number;
  critical: boolean;
}

interface NotificationsContextValue {
  items: NotificationItem[];
  unread: number;
  summary: NotificationsSummary;
  badges: Record<NotifSection, SectionBadge>;
  currentAlert: AppAlert | null;
  pendingAlerts: number;
  centerOpen: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markSectionSeen: (section: NotifSection) => void;
  showAlert: (alert: Omit<AppAlert, 'id'>) => void;
  dismissAlert: () => void;
  openCenter: () => void;
  closeCenter: () => void;
  /** Lleva a la sección (lo registra la pantalla principal). */
  goToSection: (section: NotifSection) => void;
  registerNavigator: (fn: ((section: NotifSection) => void) | null) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const POLL_MS = 15_000;
const EMPTY_SUMMARY: NotificationsSummary = { newTrips: 0, pendingRequests: 0 };

const toneFor = (n: NotificationItem): AlertTone => {
  if (n.critical) return 'critical';
  if (n.type === 'viaje_lleno') return 'warning';
  if (n.type === 'solicitud_aceptada' || n.type === 'lugar_liberado') return 'success';
  return 'info';
};

const alertFromNotification = (n: NotificationItem): AppAlert => ({
  id: `notif-${n.id}`,
  tone: toneFor(n),
  title: n.title,
  message: n.message,
  icon: NOTIFICATION_META[n.type]?.icon,
  notificationId: n.id,
  section: NOTIFICATION_META[n.type]?.section,
});

function vibrate(tone: AlertTone) {
  const type =
    tone === 'critical'
      ? Haptics.NotificationFeedbackType.Error
      : tone === 'warning'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success;
  Haptics.notificationAsync(type).catch(() => {
    /* sin motor de vibración (web de escritorio, simulador) */
  });
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [summary, setSummary] = useState<NotificationsSummary>(EMPTY_SUMMARY);
  const [queue, setQueue] = useState<AppAlert[]>([]);
  const [centerOpen, setCenterOpen] = useState(false);
  const seenIds = useRef<Set<string> | null>(null); // null = aún no se hace la primera carga
  const lastNewTrips = useRef(0);
  const navigator = useRef<((section: NotifSection) => void) | null>(null);

  const enqueue = useCallback((alerts: AppAlert[]) => {
    if (!alerts.length) return;
    // Las críticas van primero en la cola.
    setQueue((q) => [...q, ...alerts].sort((a, b) => Number(b.tone === 'critical') - Number(a.tone === 'critical')));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchNotifications();
      setItems(res.items);
      setUnread(res.unread);
      setSummary(res.summary ?? EMPTY_SUMMARY);
      const newTrips = res.summary?.newTrips ?? 0;

      if (seenIds.current === null) {
        // Primera carga: no se repite cada aviso, pero se resumen las cancelaciones sin leer.
        seenIds.current = new Set(res.items.map((n) => n.id));
        lastNewTrips.current = newTrips;
        const criticalUnread = res.items.filter((n) => n.critical && !n.read);
        if (criticalUnread.length === 1) enqueue([alertFromNotification(criticalUnread[0])]);
        else if (criticalUnread.length > 1) {
          enqueue([{
            id: `resumen-${Date.now()}`,
            tone: 'critical',
            title: `Tienes ${criticalUnread.length} avisos importantes sin leer`,
            message: criticalUnread.map((n) => `• ${n.title}`).join('\n'),
            section: 'myTrips',
          }]);
        }
        return;
      }

      const fresh = res.items.filter((n) => !n.read && !seenIds.current!.has(n.id));
      res.items.forEach((n) => seenIds.current!.add(n.id));
      const alerts = fresh.reverse().map(alertFromNotification); // de la más antigua a la más nueva

      // Viajes nuevos publicados por otros conductores desde la última consulta.
      if (newTrips > lastNewTrips.current) {
        const diff = newTrips - lastNewTrips.current;
        alerts.push({
          id: `trips-${Date.now()}`,
          tone: 'trip',
          title: diff === 1 ? 'Se publicó un viaje nuevo' : `Se publicaron ${diff} viajes nuevos`,
          message: 'Revisa la búsqueda y aparta tu lugar antes de que se llene.',
          section: 'search',
        });
      }
      lastNewTrips.current = newTrips;
      enqueue(alerts);
    } catch (err) {
      console.warn('[notificaciones] no se pudo consultar la bandeja:', err);
    }
  }, [enqueue]);

  // Sondeo periódico mientras la app está en primer plano.
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const currentAlert = queue[0] ?? null;

  // Vibración al aparecer cada alerta.
  const lastVibrated = useRef<string | null>(null);
  useEffect(() => {
    if (currentAlert && lastVibrated.current !== currentAlert.id) {
      lastVibrated.current = currentAlert.id;
      vibrate(currentAlert.tone);
    }
  }, [currentAlert]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markNotificationRead(id);
    } catch (err) {
      console.warn('[notificaciones] no se pudo marcar como leída:', err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.warn('[notificaciones] no se pudieron marcar todas:', err);
    }
  }, []);

  const markSectionSeen = useCallback((section: NotifSection) => {
    if (section === 'search') {
      setSummary((s) => ({ ...s, newTrips: 0 }));
      lastNewTrips.current = 0;
      markTripsSeen().catch((err) => console.warn('[notificaciones] no se pudo marcar la búsqueda:', err));
      return;
    }
    const types = SECTION_TYPES[section];
    const pending = items.filter((n) => !n.read && types.includes(n.type)).length;
    if (pending === 0) return;
    setItems((list) => list.map((n) => (types.includes(n.type) ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - pending));
    markAllNotificationsRead(types).catch((err) => console.warn('[notificaciones] no se pudo marcar la sección:', err));
  }, [items]);

  const showAlert = useCallback(
    (alert: Omit<AppAlert, 'id'>) => enqueue([{ ...alert, id: `local-${Date.now()}-${Math.random()}` }]),
    [enqueue]
  );

  const dismissAlert = useCallback(() => {
    if (currentAlert?.notificationId) markRead(currentAlert.notificationId);
    setQueue((q) => (q[0]?.id === currentAlert?.id ? q.slice(1) : q));
  }, [currentAlert, markRead]);

  const goToSection = useCallback((section: NotifSection) => {
    setCenterOpen(false);
    navigator.current?.(section);
  }, []);

  const registerNavigator = useCallback((fn: ((section: NotifSection) => void) | null) => {
    navigator.current = fn;
  }, []);

  const badges = useMemo<Record<NotifSection, SectionBadge>>(() => {
    const myTripsUnread = items.filter((n) => !n.read && SECTION_TYPES.myTrips.includes(n.type));
    return {
      search: { count: summary.newTrips, critical: false },
      myTrips: { count: myTripsUnread.length, critical: myTripsUnread.some((n) => n.critical) },
      requests: { count: summary.pendingRequests, critical: false },
    };
  }, [items, summary]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread,
      summary,
      badges,
      currentAlert,
      pendingAlerts: Math.max(0, queue.length - 1),
      centerOpen,
      refresh,
      markRead,
      markAllRead,
      markSectionSeen,
      showAlert,
      dismissAlert,
      openCenter: () => setCenterOpen(true),
      closeCenter: () => setCenterOpen(false),
      goToSection,
      registerNavigator,
    }),
    [items, unread, summary, badges, currentAlert, queue.length, centerOpen, refresh, markRead, markAllRead,
      markSectionSeen, showAlert, dismissAlert, goToSection, registerNavigator]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de <NotificationsProvider>');
  return ctx;
}
