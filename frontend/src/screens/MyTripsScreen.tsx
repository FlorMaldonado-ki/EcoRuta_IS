import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { THEME } from '../constants/theme';
import {
  getMyTrips,
  cancelReservation,
  finishTrip,
  cancelTripByDriver,
} from '../services/tripStorage';
import type { TripDTO, ReservationDTO, UserDTO } from '../types/api';

interface MyTripsScreenProps {
  currentUser: UserDTO;
  onBack: () => void;
  onSelectTripDetail: (trip: TripDTO) => void;
  onGoToRequests: () => void;
  onGoToPublishTrip: () => void;
}

type RoleMode = 'passenger' | 'driver';
type StatusFilter = 'active' | 'finished' | 'cancelled';

export const MyTripsScreen: React.FC<MyTripsScreenProps> = ({
  currentUser,
  onBack,
  onSelectTripDetail,
  onGoToRequests,
  onGoToPublishTrip,
}) => {
  const [roleMode, setRoleMode] = useState<RoleMode>('passenger');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [driverTrips, setDriverTrips] = useState<TripDTO[]>([]);
  const [passengerTrips, setPassengerTrips] = useState<{ trip: TripDTO; reservation: ReservationDTO }[]>([]);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Modal para confirmación de cancelación de pasajero con aviso de 20 min (RN-06)
  const [cancelReservationTarget, setCancelReservationTarget] = useState<{
    reservationId: string;
    trip: TripDTO;
    isLate: boolean;
  } | null>(null);

  // Modal para confirmación de cancelación de conductor
  const [cancelTripTarget, setCancelTripTarget] = useState<TripDTO | null>(null);

  const loadData = () => {
    const { asDriver, asPassenger } = getMyTrips(currentUser.id);
    setDriverTrips(asDriver);
    setPassengerTrips(asPassenger);
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id]);

  // Filtrado de viajes de pasajero
  const filteredPassengerList = useMemo(() => {
    return passengerTrips.filter((item) => {
      const isCancelled = item.reservation.status === 'cancelada';
      const isFinished = item.trip.status === 'finished';

      if (statusFilter === 'active') {
        return !isCancelled && !isFinished && item.reservation.status !== 'rechazada';
      }
      if (statusFilter === 'finished') {
        return isFinished;
      }
      if (statusFilter === 'cancelled') {
        return isCancelled || item.reservation.status === 'rechazada';
      }
      return true;
    });
  }, [passengerTrips, statusFilter]);

  // Filtrado de viajes de conductor
  const filteredDriverList = useMemo(() => {
    return driverTrips.filter((t) => {
      if (statusFilter === 'active') return t.status === 'published';
      if (statusFilter === 'finished') return t.status === 'finished';
      if (statusFilter === 'cancelled') return t.status === 'cancelled';
      return true;
    });
  }, [driverTrips, statusFilter]);

  // Manejar solicitud de cancelación de pasajero
  const handlePromptCancelReservation = (reservationId: string, trip: TripDTO) => {
    const depMs = new Date(trip.departureAt).getTime();
    const minutesToDeparture = (depMs - Date.now()) / 60_000;
    const isLate = minutesToDeparture < 20;

    setCancelReservationTarget({ reservationId, trip, isLate });
  };

  const handleConfirmCancelReservation = () => {
    if (!cancelReservationTarget) return;
    const { reservationId } = cancelReservationTarget;

    setActionLoadingId(reservationId);
    setFeedback(null);

    setTimeout(() => {
      const res = cancelReservation(reservationId, currentUser.id);
      setActionLoadingId(null);
      setCancelReservationTarget(null);
      if (res.ok) {
        setFeedback({
          text: res.message,
          type: res.lateCancellation ? 'warning' : 'success',
        });
        loadData();
      } else {
        setFeedback({ text: res.message, type: 'error' });
      }
    }, 350);
  };

  // Finalizar viaje por conductor
  const handleFinishTrip = (tripId: string) => {
    setActionLoadingId(tripId);
    setFeedback(null);

    setTimeout(() => {
      const res = finishTrip(tripId);
      setActionLoadingId(null);
      if (res.ok) {
        setFeedback({ text: res.message, type: 'success' });
        loadData();
      } else {
        setFeedback({ text: res.message, type: 'error' });
      }
    }, 350);
  };

  // Cancelar viaje por conductor
  const handleConfirmCancelTrip = () => {
    if (!cancelTripTarget) return;
    const tripId = cancelTripTarget.id;

    setActionLoadingId(tripId);
    setFeedback(null);

    setTimeout(() => {
      const res = cancelTripByDriver(tripId);
      setActionLoadingId(null);
      setCancelTripTarget(null);
      if (res.ok) {
        setFeedback({ text: res.message, type: 'success' });
        loadData();
      } else {
        setFeedback({ text: res.message, type: 'error' });
      }
    }, 350);
  };

  const formatDateTime = (isoDate: string) => {
    const d = new Date(isoDate);
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    return { time, date };
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="Historial y Viajes en Curso" />

      <View style={styles.body}>
        {/* Barra superior */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>

        {/* Feedback alert */}
        {feedback && (
          <View
            style={[
              styles.feedbackBox,
              feedback.type === 'success'
                ? styles.feedbackSuccess
                : feedback.type === 'warning'
                ? styles.feedbackWarning
                : styles.feedbackError,
            ]}
          >
            <MaterialCommunityIcons
              name={
                feedback.type === 'success'
                  ? 'check-circle'
                  : feedback.type === 'warning'
                  ? 'alert'
                  : 'alert-circle'
              }
              size={18}
              color={
                feedback.type === 'success'
                  ? THEME.colors.success
                  : feedback.type === 'warning'
                  ? THEME.colors.warning
                  : THEME.colors.error
              }
            />
            <Text
              style={[
                styles.feedbackText,
                {
                  color:
                    feedback.type === 'success'
                      ? THEME.colors.success
                      : feedback.type === 'warning'
                      ? THEME.colors.warning
                      : THEME.colors.error,
                },
              ]}
            >
              {feedback.text}
            </Text>
          </View>
        )}

        {/* Selector de Rol Principal */}
        <View style={styles.roleTabsContainer}>
          <TouchableOpacity
            style={[styles.roleTab, roleMode === 'passenger' && styles.roleTabActive]}
            onPress={() => setRoleMode('passenger')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="account-search"
              size={18}
              color={roleMode === 'passenger' ? THEME.colors.primary : THEME.colors.textMuted}
            />
            <Text
              style={[
                styles.roleTabText,
                roleMode === 'passenger' && styles.roleTabTextActive,
              ]}
            >
              Como Pasajero
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleTab, roleMode === 'driver' && styles.roleTabActive]}
            onPress={() => setRoleMode('driver')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="steering"
              size={18}
              color={roleMode === 'driver' ? THEME.colors.primary : THEME.colors.textMuted}
            />
            <Text
              style={[
                styles.roleTabText,
                roleMode === 'driver' && styles.roleTabTextActive,
              ]}
            >
              Como Conductor
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sub-Filtros de Estado */}
        <View style={styles.statusFiltersRow}>
          <TouchableOpacity
            style={[
              styles.statusChip,
              statusFilter === 'active' && styles.statusChipActive,
            ]}
            onPress={() => setStatusFilter('active')}
          >
            <Text
              style={[
                styles.statusChipText,
                statusFilter === 'active' && styles.statusChipTextActive,
              ]}
            >
              Próximos / Activos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusChip,
              statusFilter === 'finished' && styles.statusChipActive,
            ]}
            onPress={() => setStatusFilter('finished')}
          >
            <Text
              style={[
                styles.statusChipText,
                statusFilter === 'finished' && styles.statusChipTextActive,
              ]}
            >
              Completados
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusChip,
              statusFilter === 'cancelled' && styles.statusChipActive,
            ]}
            onPress={() => setStatusFilter('cancelled')}
          >
            <Text
              style={[
                styles.statusChipText,
                statusFilter === 'cancelled' && styles.statusChipTextActive,
              ]}
            >
              Cancelados
            </Text>
          </TouchableOpacity>
        </View>

        {/* ================================================================= */}
        {/* VISTA COMO PASAJERO                                               */}
        {/* ================================================================= */}
        {roleMode === 'passenger' && (
          <View>
            {filteredPassengerList.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons
                  name="ticket-outline"
                  size={46}
                  color={THEME.colors.textMuted}
                />
                <Text style={styles.emptyTitle}>Sin reservaciones</Text>
                <Text style={styles.emptySubtitle}>
                  {statusFilter === 'active'
                    ? 'No tienes viajes próximos reservados. ¡Explora los viajes disponibles!'
                    : 'No hay viajes registrados en este filtro.'}
                </Text>
              </View>
            ) : (
              filteredPassengerList.map(({ trip, reservation }) => {
                const { time, date } = formatDateTime(trip.departureAt);
                const isAccepted = reservation.status === 'aceptada';
                const isPending = reservation.status === 'pendiente' || reservation.status === 'solicitada';
                const isActing = actionLoadingId === reservation.id;

                return (
                  <View key={reservation.id} style={styles.tripCard}>
                    {/* Cabecera del Viaje */}
                    <View style={styles.tripCardHeader}>
                      <View style={styles.driverCol}>
                        <Text style={styles.driverName}>{trip.driver.fullName}</Text>
                        <Text style={styles.driverCar}>
                          {trip.vehicle.brand} {trip.vehicle.model} · {trip.vehicle.color}
                        </Text>
                      </View>

                      {/* Badge de estado de reservación */}
                      <View
                        style={[
                          styles.badgePill,
                          isAccepted
                            ? { backgroundColor: THEME.colors.successBg }
                            : isPending
                            ? { backgroundColor: THEME.colors.warningBg }
                            : { backgroundColor: THEME.colors.surfaceAlt },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgePillText,
                            isAccepted
                              ? { color: THEME.colors.success }
                              : isPending
                              ? { color: THEME.colors.warning }
                              : { color: THEME.colors.textMuted },
                          ]}
                        >
                          {isAccepted
                            ? 'Confirmado'
                            : isPending
                            ? 'Pendiente'
                            : reservation.status === 'rechazada'
                            ? 'Rechazado'
                            : 'Cancelado'}
                        </Text>
                      </View>
                    </View>

                    {/* Regla de Privacidad RNF-12: Placas protegidas */}
                    <View style={styles.platesContainer}>
                      {isAccepted ? (
                        <View style={styles.platesConfirmedRow}>
                          <MaterialCommunityIcons name="car-info" size={16} color={THEME.colors.primary} />
                          <Text style={styles.platesConfirmedText}>
                            Placas autorizadas: <Text style={styles.platesCode}>{trip.vehicle.plates}</Text>
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.platesProtectedRow}>
                          <MaterialCommunityIcons name="lock-outline" size={14} color={THEME.colors.textMuted} />
                          <Text style={styles.platesProtectedText}>
                            Placas protegidas (RNF-12) · Visibles al ser aceptado
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Origen y Destino */}
                    <View style={styles.tripRouteBox}>
                      <View style={styles.routeItemRow}>
                        <View style={[styles.miniDot, { backgroundColor: THEME.colors.success }]} />
                        <Text style={styles.routeItemText} numberOfLines={1}>
                          {trip.origin.text}
                        </Text>
                      </View>
                      <View style={styles.routeItemRow}>
                        <View style={[styles.miniDot, { backgroundColor: THEME.colors.primary }]} />
                        <Text style={styles.routeItemText} numberOfLines={1}>
                          {trip.destination.text}
                        </Text>
                      </View>
                    </View>

                    {/* Fecha y Hora */}
                    <View style={styles.timeRow}>
                      <View style={styles.timeTag}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color={THEME.colors.primary} />
                        <Text style={styles.timeTagText}>{time}</Text>
                      </View>
                      <View style={styles.timeTag}>
                        <MaterialCommunityIcons name="calendar" size={14} color={THEME.colors.primary} />
                        <Text style={styles.timeTagText}>{date}</Text>
                      </View>
                    </View>

                    {/* Botones de acción del pasajero */}
                    <View style={styles.tripCardActions}>
                      <TouchableOpacity
                        style={styles.detailBtn}
                        onPress={() => onSelectTripDetail(trip)}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="map-search-outline" size={16} color={THEME.colors.primary} />
                        <Text style={styles.detailBtnText}>Ver en Mapa</Text>
                      </TouchableOpacity>

                      {(isAccepted || isPending) && (
                        <TouchableOpacity
                          style={styles.cancelSeatBtn}
                          onPress={() => handlePromptCancelReservation(reservation.id, trip)}
                          disabled={isActing}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons name="close-circle-outline" size={16} color={THEME.colors.error} />
                          <Text style={styles.cancelSeatBtnText}>Cancelar Lugar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* VISTA COMO CONDUCTOR                                              */}
        {/* ================================================================= */}
        {roleMode === 'driver' && (
          <View>
            {/* Acceso directo a solicitudes y registrar */}
            <View style={styles.driverShortcutsRow}>
              <TouchableOpacity
                style={styles.shortcutBtn}
                onPress={onGoToRequests}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="account-clock" size={20} color={THEME.colors.primary} />
                <Text style={styles.shortcutBtnText}>Solicitudes Recibidas</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.shortcutBtn, { backgroundColor: THEME.colors.primary }]}
                onPress={onGoToPublishTrip}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={THEME.colors.textInverse} />
                <Text style={[styles.shortcutBtnText, { color: THEME.colors.textInverse }]}>
                  Registrar Viaje
                </Text>
              </TouchableOpacity>
            </View>

            {filteredDriverList.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons
                  name="car-off"
                  size={46}
                  color={THEME.colors.textMuted}
                />
                <Text style={styles.emptyTitle}>Sin viajes publicados</Text>
                <Text style={styles.emptySubtitle}>
                  {statusFilter === 'active'
                    ? 'No tienes viajes activos programados. ¡Crea uno nuevo para compartir tu trayecto!'
                    : 'No hay viajes en esta sección.'}
                </Text>
              </View>
            ) : (
              filteredDriverList.map((trip) => {
                const { time, date } = formatDateTime(trip.departureAt);
                const depMs = new Date(trip.departureAt).getTime();
                const canFinish = depMs <= Date.now() && trip.status === 'published';
                const isActing = actionLoadingId === trip.id;

                return (
                  <View key={trip.id} style={styles.tripCard}>
                    {/* Cabecera */}
                    <View style={styles.tripCardHeader}>
                      <View style={styles.driverCol}>
                        <Text style={styles.driverName}>
                          {trip.direction === 'to_campus' ? 'Hacia el Campus' : 'Desde el Campus'}
                        </Text>
                        <Text style={styles.driverCar}>
                          {trip.seatsAvailable} de {trip.seatsTotal} lugares libres
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.badgePill,
                          trip.status === 'published'
                            ? { backgroundColor: THEME.colors.successBg }
                            : trip.status === 'finished'
                            ? { backgroundColor: THEME.colors.surfaceAlt }
                            : { backgroundColor: THEME.colors.errorBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgePillText,
                            trip.status === 'published'
                              ? { color: THEME.colors.success }
                              : trip.status === 'finished'
                              ? { color: THEME.colors.textMuted }
                              : { color: THEME.colors.error },
                          ]}
                        >
                          {trip.status === 'published'
                            ? 'Publicado'
                            : trip.status === 'finished'
                            ? 'Completado'
                            : 'Cancelado'}
                        </Text>
                      </View>
                    </View>

                    {/* Origen y Destino */}
                    <View style={styles.tripRouteBox}>
                      <View style={styles.routeItemRow}>
                        <View style={[styles.miniDot, { backgroundColor: THEME.colors.success }]} />
                        <Text style={styles.routeItemText} numberOfLines={1}>
                          {trip.origin.text}
                        </Text>
                      </View>
                      <View style={styles.routeItemRow}>
                        <View style={[styles.miniDot, { backgroundColor: THEME.colors.primary }]} />
                        <Text style={styles.routeItemText} numberOfLines={1}>
                          {trip.destination.text}
                        </Text>
                      </View>
                    </View>

                    {/* Fecha y Hora */}
                    <View style={styles.timeRow}>
                      <View style={styles.timeTag}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color={THEME.colors.primary} />
                        <Text style={styles.timeTagText}>{time}</Text>
                      </View>
                      <View style={styles.timeTag}>
                        <MaterialCommunityIcons name="calendar" size={14} color={THEME.colors.primary} />
                        <Text style={styles.timeTagText}>{date}</Text>
                      </View>
                      <View style={styles.timeTag}>
                        <MaterialCommunityIcons name="map-marker-multiple" size={14} color={THEME.colors.accent} />
                        <Text style={styles.timeTagText}>
                          {(trip.meetingPoints || []).length} paradas
                        </Text>
                      </View>
                    </View>

                    {/* Acciones de Conductor */}
                    {trip.status === 'published' && (
                      <View style={styles.tripCardActions}>
                        <TouchableOpacity
                          style={[styles.finishBtn, !canFinish && styles.finishBtnDisabled]}
                          onPress={() => handleFinishTrip(trip.id)}
                          disabled={!canFinish || isActing}
                          activeOpacity={0.8}
                        >
                          {isActing ? (
                            <ActivityIndicator size="small" color={THEME.colors.success} />
                          ) : (
                            <>
                              <MaterialCommunityIcons
                                name="flag-checkered"
                                size={16}
                                color={canFinish ? THEME.colors.success : THEME.colors.textMuted}
                              />
                              <Text
                                style={[
                                  styles.finishBtnText,
                                  !canFinish && { color: THEME.colors.textMuted },
                                ]}
                              >
                                Finalizar Viaje
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cancelTripBtn}
                          onPress={() => setCancelTripTarget(trip)}
                          disabled={isActing}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons name="cancel" size={16} color={THEME.colors.error} />
                          <Text style={styles.cancelTripBtnText}>Cancelar Viaje</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      {/* Modal de Cancelación de Pasajero (con aviso de RN-06) */}
      <Modal visible={!!cancelReservationTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.warningIconCircle}>
              <MaterialCommunityIcons name="alert-outline" size={36} color={THEME.colors.warning} />
            </View>

            <Text style={styles.modalTitle}>¿Cancelar reservación?</Text>

            {cancelReservationTarget?.isLate ? (
              <View style={styles.lateNoticeBox}>
                <MaterialCommunityIcons name="clock-alert" size={18} color={THEME.colors.error} />
                <Text style={styles.lateNoticeText}>
                  <Text style={{ fontWeight: '800' }}>Cancelación tardía (RN-06):</Text> Faltan menos de 20 minutos para la salida programada del viaje. Esta cancelación se registrará como aviso tardío.
                </Text>
              </View>
            ) : (
              <Text style={styles.modalMessage}>
                ¿Estás seguro de que deseas cancelar tu lugar? Tu asiento se liberará de inmediato para otro compañero de la comunidad.
              </Text>
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCancelReservationTarget(null)}
              >
                <Text style={styles.modalCancelBtnText}>Conservar lugar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmCancelReservation}
              >
                <Text style={styles.modalConfirmBtnText}>Sí, cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Cancelación de Viaje por Conductor */}
      <Modal visible={!!cancelTripTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.errorIconCircle}>
              <MaterialCommunityIcons name="car-off" size={36} color={THEME.colors.error} />
            </View>

            <Text style={styles.modalTitle}>¿Cancelar viaje publicado?</Text>
            <Text style={styles.modalMessage}>
              Al cancelar este viaje, se avisará inmediatamente a todos los pasajeros inscritos mediante notificación y correo institucional para que busquen una ruta alternativa.
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCancelTripTarget(null)}
              >
                <Text style={styles.modalCancelBtnText}>No cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: THEME.colors.error }]}
                onPress={handleConfirmCancelTrip}
              >
                <Text style={styles.modalConfirmBtnText}>Cancelar Viaje</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
  feedbackWarning: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warningBorder,
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
  roleTabsContainer: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    padding: 4,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 14,
    gap: 6,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    gap: 6,
  },
  roleTabActive: {
    backgroundColor: THEME.colors.primarySoft,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  roleTabTextActive: {
    color: THEME.colors.primary,
  },
  statusFiltersRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  statusChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
  },
  statusChipActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primary,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  statusChipTextActive: {
    color: THEME.colors.textInverse,
  },
  driverShortcutsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.md,
    paddingVertical: 10,
    gap: 6,
    ...THEME.shadows.card,
  },
  shortcutBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  emptyCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 36,
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
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
  tripCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 16,
    marginBottom: 14,
    ...THEME.shadows.card,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  driverCol: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  driverCar: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.full,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  platesContainer: {
    marginBottom: 10,
  },
  platesConfirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sm,
    gap: 6,
    alignSelf: 'flex-start',
  },
  platesConfirmedText: {
    fontSize: 11,
    color: THEME.colors.textPrimary,
  },
  platesCode: {
    fontWeight: '900',
    letterSpacing: 1,
    color: THEME.colors.primary,
  },
  platesProtectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sm,
    gap: 6,
    alignSelf: 'flex-start',
  },
  platesProtectedText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
  },
  tripRouteBox: {
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 10,
    borderRadius: THEME.borderRadius.sm,
    gap: 6,
    marginBottom: 10,
  },
  routeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeItemText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.borderRadius.sm,
  },
  timeTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  tripCardActions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    paddingTop: 12,
  },
  detailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    gap: 6,
  },
  detailBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  cancelSeatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
    backgroundColor: THEME.colors.errorBg,
    gap: 6,
  },
  cancelSeatBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.error,
  },
  finishBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1.5,
    borderColor: THEME.colors.successBorder,
    backgroundColor: THEME.colors.successBg,
    gap: 6,
  },
  finishBtnDisabled: {
    opacity: 0.5,
  },
  finishBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.success,
  },
  cancelTripBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
    backgroundColor: THEME.colors.errorBg,
    gap: 6,
  },
  cancelTripBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.xl,
    padding: 24,
    maxWidth: 420,
    width: '100%',
    alignItems: 'center',
    ...THEME.shadows.hover,
  },
  warningIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  lateNoticeBox: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.errorBg,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
    padding: 12,
    gap: 8,
    marginBottom: 18,
  },
  lateNoticeText: {
    fontSize: 12,
    color: THEME.colors.error,
    flex: 1,
    lineHeight: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.error,
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
});
