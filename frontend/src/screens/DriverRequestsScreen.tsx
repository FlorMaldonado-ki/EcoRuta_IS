import React, { useState, useEffect, useMemo } from 'react';
import {
  Linking,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { THEME } from '../constants/theme';
import {
  getDriverReservations,
  acceptReservationRequest,
  rejectReservationRequest,
  errorMessage,
  isWaitlisted,
} from '../services/tripService';
import type { ReservationDTO, UserDTO } from '../types/api';
import { useNotifications } from '../hooks/useNotifications';

interface DriverRequestsScreenProps {
  currentUser: UserDTO;
  onBack: () => void;
}

type TabFilter = 'pendiente' | 'aceptada' | 'rechazada' | 'todas';

export const DriverRequestsScreen: React.FC<DriverRequestsScreenProps> = ({
  currentUser,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<TabFilter>('pendiente');
  const [reservations, setReservations] = useState<ReservationDTO[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const { showAlert, summary } = useNotifications();
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      setReservations(await getDriverReservations(currentUser));
    } catch (err) {
      setFeedbackMessage({ text: errorMessage(err), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Recarga al entrar y cada vez que cambia el número de solicitudes pendientes (llegó una nueva).
  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, summary.pendingRequests]);

  const filteredReservations = useMemo(() => {
    if (activeTab === 'todas') return reservations;
    if (activeTab === 'pendiente') {
      return reservations.filter((r) => r.status === 'pendiente' || r.status === 'solicitada');
    }
    return reservations.filter((r) => r.status === activeTab);
  }, [reservations, activeTab]);

  const pendingCount = useMemo(() => {
    return reservations.filter((r) => r.status === 'pendiente' || r.status === 'solicitada').length;
  }, [reservations]);

  const respond = async (reservationId: string, action: 'accept' | 'reject') => {
    const passenger = reservations.find((r) => r.id === reservationId)?.passengerName ?? 'El pasajero';
    setActionLoadingId(reservationId);
    setFeedbackMessage(null);
    try {
      if (action === 'accept') {
        await acceptReservationRequest(reservationId);
        setFeedbackMessage({ text: 'Solicitud aceptada y lugar asignado.', type: 'success' });
        showAlert({ tone: 'success', title: 'Pasajero aceptado', message: `${passenger} ya tiene su lugar y fue notificado.` });
      } else {
        await rejectReservationRequest(reservationId);
        setFeedbackMessage({ text: 'Solicitud rechazada.', type: 'success' });
        showAlert({ tone: 'warning', title: 'Solicitud rechazada', message: `Avisamos a ${passenger} para que busque otro viaje.` });
      }
      await loadRequests();
    } catch (err) {
      setFeedbackMessage({ text: errorMessage(err), type: 'error' });
      showAlert({ tone: 'warning', title: 'No se pudo responder la solicitud', message: errorMessage(err) });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAccept = (reservationId: string) => respond(reservationId, 'accept');
  const handleReject = (reservationId: string) => respond(reservationId, 'reject');

  const getStatusBadge = (status: ReservationDTO['status']) => {
    switch (status) {
      case 'solicitada':
      case 'pendiente':
        return {
          label: 'Pendiente de respuesta',
          bg: THEME.colors.warningBg,
          color: THEME.colors.warning,
          icon: 'clock-outline',
        };
      case 'aceptada':
        return {
          label: 'Aceptada · Lugar asignado',
          bg: THEME.colors.successBg,
          color: THEME.colors.success,
          icon: 'check-circle-outline',
        };
      case 'rechazada':
        return {
          label: 'Rechazada',
          bg: THEME.colors.errorBg,
          color: THEME.colors.error,
          icon: 'close-circle-outline',
        };
      case 'cancelada':
      default:
        return {
          label: 'Cancelada por pasajero',
          bg: THEME.colors.surfaceAlt,
          color: THEME.colors.textMuted,
          icon: 'cancel',
        };
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="Gestión de Solicitudes de Pasajeros" />

      <View style={styles.body}>
        {/* Barra superior */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>

        {/* Feedback alert */}
        {feedbackMessage && (
          <View
            style={[
              styles.feedbackBox,
              feedbackMessage.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}
          >
            <MaterialCommunityIcons
              name={feedbackMessage.type === 'success' ? 'check-circle' : 'alert-circle'}
              size={18}
              color={feedbackMessage.type === 'success' ? THEME.colors.success : THEME.colors.error}
            />
            <Text
              style={[
                styles.feedbackText,
                feedbackMessage.type === 'success'
                  ? { color: THEME.colors.success }
                  : { color: THEME.colors.error },
              ]}
            >
              {feedbackMessage.text}
            </Text>
          </View>
        )}

        {/* Pestañas de estado */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pendiente' && styles.tabActive]}
            onPress={() => setActiveTab('pendiente')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'pendiente' && styles.tabTextActive]}>
              Pendientes
            </Text>
            {pendingCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'aceptada' && styles.tabActive]}
            onPress={() => setActiveTab('aceptada')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'aceptada' && styles.tabTextActive]}>
              Aceptadas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'rechazada' && styles.tabActive]}
            onPress={() => setActiveTab('rechazada')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'rechazada' && styles.tabTextActive]}>
              Rechazadas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'todas' && styles.tabActive]}
            onPress={() => setActiveTab('todas')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'todas' && styles.tabTextActive]}>
              Todas
            </Text>
          </TouchableOpacity>
        </View>

        {/* Lista de solicitudes */}
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
          </View>
        ) : filteredReservations.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="inbox-outline"
              size={48}
              color={THEME.colors.textMuted}
            />
            <Text style={styles.emptyTitle}>No hay solicitudes</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'pendiente'
                ? 'No tienes solicitudes pendientes por responder en este momento.'
                : `No hay registros en la categoría "${activeTab}".`}
            </Text>
          </View>
        ) : (
          filteredReservations.map((res) => {
            const waiting = res.trip ? isWaitlisted(res.status, res.trip) : false;
            const badge = waiting
              ? { label: 'En espera · viaje lleno', bg: THEME.colors.warningBg, color: THEME.colors.warning, icon: 'account-clock' }
              : getStatusBadge(res.status);
            const isActing = actionLoadingId === res.id;
            const jp = res.joinPoint;
            const reqDate = new Date(res.requestedAt || res.createdAt).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <View key={res.id} style={styles.requestCard}>
                {/* Cabecera de la solicitud: Pasajero y Badge */}
                <View style={styles.cardTopRow}>
                  <View style={styles.passengerRow}>
                    <View style={styles.passengerAvatar}>
                      <MaterialCommunityIcons
                        name="account"
                        size={22}
                        color={THEME.colors.primary}
                      />
                    </View>
                    <View style={styles.passengerDetails}>
                      <Text style={styles.passengerName}>{res.passengerName}</Text>
                      <Text style={styles.passengerAffiliation}>
                        {res.passengerAffiliation || 'TecNM Campus Morelia'}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <MaterialCommunityIcons
                      name={badge.icon as any}
                      size={14}
                      color={badge.color}
                    />
                    <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>

                {/* Separador */}
                <View style={styles.cardDivider} />

                {/* Fecha y detalles */}
                <View style={styles.metaRow}>
                  <MaterialCommunityIcons
                    name="calendar-clock"
                    size={16}
                    color={THEME.colors.textMuted}
                  />
                  <Text style={styles.metaText}>Solicitado el {reqDate}</Text>
                </View>

                {res.trip ? (
                  <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="map-marker-path" size={16} color={THEME.colors.textMuted} />
                    <Text style={styles.metaText} numberOfLines={2}>
                      {res.trip.origin.text} → {res.trip.destination.text} ·{' '}
                      {new Date(res.trip.departureAt).toLocaleString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                ) : null}

                {/* Dónde se une el pasajero */}
                {jp ? (
                  <View style={[styles.joinBox, jp.type === 'proposed' && styles.joinBoxProposed]}>
                    <MaterialCommunityIcons
                      name={jp.type === 'driver' ? 'map-marker-check' : 'map-marker-star'}
                      size={20}
                      color={jp.type === 'driver' ? THEME.colors.primary : THEME.colors.accentDark}
                    />
                    <View style={styles.joinBody}>
                      <Text style={styles.joinLabel}>
                        {jp.type === 'driver' ? 'Se une en tu punto de encuentro' : 'Propone otro punto de la ruta'}
                      </Text>
                      <Text style={styles.joinName}>{jp.name}</Text>
                      {jp.note ? <Text style={styles.joinNote}>“{jp.note}”</Text> : null}
                      {jp.type === 'proposed' && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${jp.lat}&mlon=${jp.lng}#map=18/${jp.lat}/${jp.lng}`)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.joinMapLink}>Ver punto en el mapa ›</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : null}

                {waiting && (
                  <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="information-outline" size={16} color={THEME.colors.warning} />
                    <Text style={[styles.metaText, { color: THEME.colors.warning }]}>
                      Tu viaje está lleno. Podrás aceptarlo si alguien cancela; ya le avisamos que está en lista de espera.
                    </Text>
                  </View>
                )}

                {res.status === 'aceptada' && res.passengerPhone ? (
                  <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="phone" size={16} color={THEME.colors.textMuted} />
                    <Text style={styles.metaText}>Teléfono: {res.passengerPhone}</Text>
                  </View>
                ) : null}

                {/* Botones de Acción (Si está pendiente o solicitada) */}
                {(res.status === 'pendiente' || res.status === 'solicitada') && (
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      style={[styles.rejectBtn, isActing && styles.btnDisabled]}
                      onPress={() => handleReject(res.id)}
                      disabled={isActing}
                      activeOpacity={0.8}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color={THEME.colors.error} />
                      ) : (
                        <>
                          <MaterialCommunityIcons
                            name="close"
                            size={18}
                            color={THEME.colors.error}
                          />
                          <Text style={styles.rejectBtnText}>Rechazar</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.acceptBtn, (isActing || waiting) && styles.btnDisabled]}
                      onPress={() => handleAccept(res.id)}
                      disabled={isActing || waiting}
                      activeOpacity={0.8}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color={THEME.colors.textInverse} />
                      ) : (
                        <>
                          <MaterialCommunityIcons
                            name="check"
                            size={18}
                            color={THEME.colors.textInverse}
                          />
                          <Text style={styles.acceptBtnText}>Aceptar Pasajero</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  joinBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    marginBottom: 12,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(107, 23, 54, 0.2)',
  },
  joinBoxProposed: {
    backgroundColor: '#FDF8E8',
    borderColor: THEME.colors.accentLight,
  },
  joinBody: {
    flex: 1,
  },
  joinLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  joinName: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 1,
  },
  joinNote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  joinMapLink: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
    marginTop: 4,
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  body: {
    padding: 16,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    gap: 8,
    marginBottom: 14,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.successBorder,
  },
  feedbackError: {
    backgroundColor: THEME.colors.errorBg,
    borderColor: THEME.colors.errorBorder,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    padding: 4,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.md,
    gap: 6,
  },
  tabActive: {
    backgroundColor: THEME.colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.textInverse,
  },
  tabBadge: {
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  emptyCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 36,
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    ...THEME.shadows.card,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  requestCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 16,
    marginBottom: 14,
    ...THEME.shadows.card,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  passengerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(107, 23, 54, 0.2)',
  },
  passengerDetails: {
    flex: 1,
  },
  passengerName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  passengerAffiliation: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.borderRadius.full,
    gap: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1.5,
    borderColor: THEME.colors.errorBorder,
    backgroundColor: THEME.colors.surface,
    gap: 6,
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.error,
  },
  acceptBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.primary,
    gap: 6,
    ...THEME.shadows.card,
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
