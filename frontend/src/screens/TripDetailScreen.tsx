import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InteractiveMap } from '../components/InteractiveMap';
import { InputField } from '../components/InputField';
import { THEME } from '../constants/theme';
import { requestSeat, cancelReservation, getTripById, errorMessage as apiErrorMessage, canFinishTrip, canEditTrip } from '../services/tripService';
import { useFinishTrip } from '../hooks/useFinishTrip';
import { TripImpactBadge } from '../components/TripImpactBadge';
import { DriverAvatar } from '../components/DriverAvatar';
import { confirmAction } from '../utils/notify';
import { useNotifications } from '../hooks/useNotifications';
import { formatDistanceKm, formatDurationMin, estimateSourceLabel } from '../utils/tripEstimate';
import type { JoinPoint, TripDTO, UserDTO } from '../types/api';
import type { ApiJoinPointRequest } from '../types/apiBackend';

/** Lo que el pasajero está eligiendo antes de solicitar. */
type JoinChoice =
  | { kind: 'driver'; pointId: string }
  | { kind: 'proposed'; lat: number | null; lng: number | null };

/** Texto para mostrar dónde se une el pasajero. */
const joinPointLabel = (jp: JoinPoint) =>
  jp.type === 'driver' ? `${jp.name} (punto del conductor)` : `${jp.name} (punto que propusiste)`;

interface TripDetailScreenProps {
  trip: TripDTO;
  currentUser: UserDTO;
  onBack: () => void;
  onTripUpdated: (updatedTrip: TripDTO) => void;
  /** Conductor: abrir "Editar viaje". */
  onEditTrip?: (trip: TripDTO) => void;
}

export const TripDetailScreen: React.FC<TripDetailScreenProps> = ({
  trip,
  currentUser,
  onBack,
  onTripUpdated,
  onEditTrip,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Al finalizar, el detalle muestra el viaje ya finalizado con su CO₂.
  const { requestFinish, finishingId } = useFinishTrip(currentUser, (r) => onTripUpdated(r.trip));
  const { showAlert } = useNotifications();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joinChoice, setJoinChoice] = useState<JoinChoice | null>(null);
  const [proposedName, setProposedName] = useState('');
  const [proposedNote, setProposedNote] = useState('');

  const depDate = new Date(trip.departureAt);
  const timeFormatted = depDate.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const dateFormatted = depDate.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let arrivalFormatted: string | null = null;
  if (trip.estimatedArrivalAt) {
    const arrDate = new Date(trip.estimatedArrivalAt);
    arrivalFormatted = arrDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Refresca el viaje desde la API (estado de mi reserva, placas visibles, asientos).
  const refreshTrip = async () => {
    try {
      onTripUpdated(await getTripById(trip.id, currentUser));
    } catch (err) {
      setErrorMessage(apiErrorMessage(err));
    }
  };

  useEffect(() => {
    refreshTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const isDriver = trip.isMine ?? trip.driver.id === currentUser.id;
  const isAccepted = trip.userReservationStatus === 'aceptada';
  const isPending = trip.userReservationStatus === 'solicitada';
  const isFull = trip.seatsAvailable <= 0;
  const isExpired = new Date(trip.departureAt).getTime() <= Date.now();
  const isUnavailable = trip.status !== 'published';

  // Privacidad de placas: solo visible para el conductor o con reserva aceptada
  const canViewPlates = isDriver || isAccepted;

  // Lista de espera: solicitud pendiente en un viaje que ya se llenó.
  const isWaitlisted = isPending && isFull && !isUnavailable;
  // ¿Puede elegir dónde unirse? (todavía no tiene solicitud y el viaje está disponible)
  const canChooseJoin = !isDriver && !isAccepted && !isPending && !isUnavailable && !isExpired && !isFull;
  const hasDriverPoints = trip.meetingPoints.length > 0;
  const pickingOnMap = canChooseJoin && joinChoice?.kind === 'proposed';
  const proposedReady = joinChoice?.kind === 'proposed' && joinChoice.lat !== null && joinChoice.lng !== null;
  const joinReady =
    joinChoice?.kind === 'driver' || proposedReady || (!hasDriverPoints && joinChoice === null);

  // Lo que se resalta en el mapa: la elección actual o el punto de la reserva existente.
  const mySavedJoin = trip.userJoinPoint ?? null;
  const mapSelectedPointId = canChooseJoin
    ? joinChoice?.kind === 'driver' ? joinChoice.pointId : null
    : mySavedJoin?.type === 'driver' ? mySavedJoin.pointId : null;
  const mapJoinPoint = canChooseJoin
    ? proposedReady && joinChoice?.kind === 'proposed'
      ? { lat: joinChoice.lat!, lng: joinChoice.lng!, name: proposedName.trim() || 'Tu punto propuesto' }
      : null
    : mySavedJoin?.type === 'proposed' ? { lat: mySavedJoin.lat, lng: mySavedJoin.lng, name: mySavedJoin.name } : null;

  const selectDriverPoint = (pointId: string) => {
    if (!canChooseJoin) return;
    setJoinChoice({ kind: 'driver', pointId });
  };

  const buildJoinRequest = (): ApiJoinPointRequest | undefined => {
    if (joinChoice?.kind === 'driver') return { pointId: joinChoice.pointId };
    if (joinChoice?.kind === 'proposed' && joinChoice.lat !== null && joinChoice.lng !== null) {
      return {
        lat: joinChoice.lat,
        lng: joinChoice.lng,
        ...(proposedName.trim() && { name: proposedName.trim() }),
        ...(proposedNote.trim() && { note: proposedNote.trim() }),
      };
    }
    return undefined;
  };

  const chosenLabel = (): string | null => {
    if (joinChoice?.kind === 'driver') return trip.meetingPoints.find((p) => p.id === joinChoice.pointId)?.name ?? null;
    if (proposedReady) return proposedName.trim() || 'Punto que marcaste en el mapa';
    return null;
  };

  const handleRequestTrip = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const where = chosenLabel();
      await requestSeat(trip.id, buildJoinRequest());
      setSuccessMessage(
        '¡Solicitud enviada con éxito! Permanecerá pendiente hasta que el conductor la acepte o rechace.'
      );
      showAlert({
        tone: 'success',
        title: 'Solicitud enviada',
        message: `Avisamos a ${trip.driver.fullName}${where ? ` que te unirás en: ${where}` : ''}. Te notificaremos en cuanto responda.`,
      });
      setJoinChoice(null);
      setProposedName('');
      setProposedNote('');
      await refreshTrip();
    } catch (err) {
      setErrorMessage(apiErrorMessage(err));
      showAlert({ tone: 'warning', title: 'No se pudo enviar la solicitud', message: apiErrorMessage(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const doCancelRequest = async () => {
    if (!trip.userReservationId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await cancelReservation(trip.userReservationId);
      setSuccessMessage(result.message);
      showAlert({
        tone: 'critical',
        title: result.lateCancellation ? 'Cancelación tardía registrada' : isAccepted ? 'Cancelaste tu lugar' : 'Cancelaste tu solicitud',
        message: `${result.message} El conductor ${trip.driver.fullName} ya fue notificado.`,
      });
      await refreshTrip();
    } catch (err) {
      setErrorMessage(apiErrorMessage(err));
      showAlert({ tone: 'warning', title: 'No se pudo cancelar', message: apiErrorMessage(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = () => {
    if (!trip.userReservationId) return;
    confirmAction(
      'Cancelar solicitud',
      '¿Estás seguro de que deseas cancelar tu lugar o solicitud para este viaje?',
      'Sí, cancelar',
      doCancelRequest
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="Detalles del Viaje" />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {successMessage && (
        <View style={styles.successBanner}>
          <MaterialCommunityIcons name="check-circle" size={20} color={THEME.colors.success} />
          <Text style={styles.successBannerText}>{successMessage}</Text>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle" size={20} color={THEME.colors.error} />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.sectionCard}>
        <View style={styles.driverHeader}>
          <DriverAvatar fullName={trip.driver.fullName} photoUrl={trip.driver.photoUrl} size={60} />

          <View style={styles.driverInfoText}>
            <View style={styles.nameBadgeRow}>
              <Text style={styles.driverName}>{trip.driver.fullName}</Text>
              <MaterialCommunityIcons name="shield-check" size={18} color={THEME.colors.accent} />
            </View>
            <Text style={styles.driverAffiliation}>
              {trip.driver.affiliation || 'Comunidad TecNM Campus Morelia'}
            </Text>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>Conductor Verificado</Text>
            </View>
          </View>
        </View>

        <View style={styles.vehicleBox}>
          <MaterialCommunityIcons name="car-info" size={20} color={THEME.colors.primary} />
          <View style={styles.vehicleDetails}>
            <Text style={styles.vehicleModel}>
              {trip.vehicle.brand} {trip.vehicle.model}
            </Text>
            <Text style={styles.vehicleColor}>Color: {trip.vehicle.color}</Text>
            {canViewPlates && trip.driver.phone ? (
              <Text style={styles.vehicleColor}>Teléfono del conductor: {trip.driver.phone}</Text>
            ) : null}
            <View style={styles.platesRow}>
              <Text style={styles.platesLabel}>Placas: </Text>
              {canViewPlates ? (
                <Text style={styles.platesValue}>{trip.vehicle.plates || 'Registradas'}</Text>
              ) : (
                <Text style={styles.platesProtected}>
                  🔒 Visibles al confirmarse tu lugar (Privacidad RNF-12)
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Itinerario del Viaje</Text>

        <View style={styles.itineraryGrid}>
          <View style={styles.itineraryItem}>
            <MaterialCommunityIcons name="clock-start" size={20} color={THEME.colors.primary} />
            <View>
              <Text style={styles.itineraryLabel}>Hora de Salida</Text>
              <Text style={styles.itineraryValue}>{timeFormatted}</Text>
              <Text style={styles.itinerarySubtext}>{dateFormatted}</Text>
            </View>
          </View>

          {arrivalFormatted && (
            <View style={styles.itineraryItem}>
              <MaterialCommunityIcons name="clock-check-outline" size={20} color={THEME.colors.success} />
              <View>
                <Text style={styles.itineraryLabel}>Llegada Estimada</Text>
                <Text style={styles.itineraryValue}>{arrivalFormatted}</Text>
                <Text style={styles.itinerarySubtext}>Aprox. {formatDurationMin(trip.durationMin)}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.estimateBox}>
          <View style={styles.estimateItem}>
            <MaterialCommunityIcons name="map-marker-distance" size={18} color={THEME.colors.primary} />
            <View>
              <Text style={styles.itineraryLabel}>Distancia</Text>
              <Text style={styles.estimateValue}>{formatDistanceKm(trip.distanceKm)}</Text>
            </View>
          </View>
          <View style={styles.estimateItem}>
            <MaterialCommunityIcons name="timer-outline" size={18} color={THEME.colors.primary} />
            <View>
              <Text style={styles.itineraryLabel}>Duración</Text>
              <Text style={styles.estimateValue}>{formatDurationMin(trip.durationMin) ?? '—'}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.estimateSource}>
          {estimateSourceLabel(trip)}
          {trip.distanceSource === 'haversine'
            ? ': el servicio de rutas no respondió; se calculó en línea recta × 1.3 a 25 km/h.'
            : ''}
        </Text>

        <View style={styles.placesContainer}>
          <View style={styles.placeRow}>
            <View style={[styles.placeMarker, { backgroundColor: THEME.colors.success }]} />
            <View style={styles.placeTextBox}>
              <Text style={styles.placeTypeLabel}>Punto de partida (Origen)</Text>
              <Text style={styles.placeName}>{trip.origin.text}</Text>
            </View>
          </View>

          <View style={styles.verticalDottedLine} />

          <View style={styles.placeRow}>
            <View style={[styles.placeMarker, { backgroundColor: THEME.colors.primary }]} />
            <View style={styles.placeTextBox}>
              <Text style={styles.placeTypeLabel}>Punto de llegada (Destino)</Text>
              <Text style={[styles.placeName, { color: THEME.colors.primary }]}>
                {trip.destination.text}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.seatsContainer}>
          <MaterialCommunityIcons name="seat-passenger" size={20} color={THEME.colors.primary} />
          <Text style={styles.seatsInfoText}>
            <Text style={styles.seatsNumber}>{trip.seatsAvailable}</Text> lugares disponibles de {trip.seatsTotal} ofrecidos
          </Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.mapTitleRow}>
          <MaterialCommunityIcons name="map-legend" size={20} color={THEME.colors.primary} />
          <Text style={styles.sectionTitle}>Recorrido y Puntos de Encuentro</Text>
        </View>
        <Text style={styles.mapSubtitle}>
          {canChooseJoin
            ? pickingOnMap
              ? 'Toca el mapa en el lugar de la ruta donde quieres que el conductor te recoja.'
              : 'Toca un punto numerado en el mapa o en la lista para elegir dónde te unirás.'
            : 'Los números son los puntos de encuentro del conductor. Puedes ampliar o mover el mapa.'}
        </Text>

        <InteractiveMap
          origin={trip.origin}
          destination={trip.destination}
          meetingPoints={trip.meetingPoints}
          mode={pickingOnMap ? 'edit_meeting_points' : 'view'}
          onMapClick={pickingOnMap ? ({ lat, lng }) => setJoinChoice({ kind: 'proposed', lat, lng }) : undefined}
          onPointPress={canChooseJoin && !pickingOnMap ? selectDriverPoint : undefined}
          selectedPointId={mapSelectedPointId}
          joinPoint={mapJoinPoint}
          height={320}
        />

        {/* Dónde me uno (reserva existente) */}
        {mySavedJoin && (isPending || isAccepted) && (
          <View style={styles.joinSavedBox}>
            <MaterialCommunityIcons name="map-marker-account" size={22} color={THEME.colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.joinSavedLabel}>Te unirás en</Text>
              <Text style={styles.joinSavedValue}>{joinPointLabel(mySavedJoin)}</Text>
              {mySavedJoin.note ? <Text style={styles.joinSavedNote}>Nota: {mySavedJoin.note}</Text> : null}
            </View>
          </View>
        )}

        {/* Puntos de encuentro del conductor (elegibles si aún no solicitas) */}
        {hasDriverPoints && (
          <View style={styles.meetingPointsList}>
            <Text style={styles.meetingPointsTitle}>
              {canChooseJoin ? '¿Dónde te unirás al viaje?' : 'Puntos de encuentro del conductor:'}
            </Text>
            {trip.meetingPoints.map((mp, index) => {
              const selected = canChooseJoin
                ? joinChoice?.kind === 'driver' && joinChoice.pointId === mp.id
                : mySavedJoin?.type === 'driver' && mySavedJoin.pointId === mp.id;
              const Row = canChooseJoin ? TouchableOpacity : View;
              return (
                <Row
                  key={mp.id || index}
                  style={[styles.choiceItem, selected && styles.choiceItemActive]}
                  {...(canChooseJoin && { onPress: () => selectDriverPoint(mp.id), activeOpacity: 0.85 })}
                >
                  <View style={[styles.mpBadge, selected && styles.mpBadgeActive]}>
                    <Text style={[styles.mpBadgeText, selected && styles.mpBadgeTextActive]}>{mp.order || index + 1}</Text>
                  </View>
                  <View style={styles.mpContent}>
                    <Text style={styles.mpName}>{mp.name}</Text>
                    {mp.description ? <Text style={styles.mpDesc}>{mp.description}</Text> : null}
                  </View>
                  {canChooseJoin && (
                    <MaterialCommunityIcons
                      name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                      size={22}
                      color={selected ? THEME.colors.primary : THEME.colors.borderSubtle}
                    />
                  )}
                  {!canChooseJoin && selected && (
                    <View style={styles.yourPointChip}>
                      <Text style={styles.yourPointChipText}>Tu punto</Text>
                    </View>
                  )}
                </Row>
              );
            })}
          </View>
        )}

        {/* Otro punto de la ruta propuesto por el pasajero */}
        {canChooseJoin && (
          <View style={styles.meetingPointsList}>
            {!hasDriverPoints && (
              <Text style={styles.meetingPointsTitle}>¿Dónde te unirás al viaje? (opcional)</Text>
            )}
            <TouchableOpacity
              style={[styles.choiceItem, joinChoice?.kind === 'proposed' && styles.choiceItemActive]}
              onPress={() =>
                setJoinChoice(joinChoice?.kind === 'proposed' ? joinChoice : { kind: 'proposed', lat: null, lng: null })
              }
              activeOpacity={0.85}
            >
              <View style={[styles.mpBadge, styles.mpBadgeStar, joinChoice?.kind === 'proposed' && styles.mpBadgeActive]}>
                <Text style={[styles.mpBadgeText, joinChoice?.kind === 'proposed' && styles.mpBadgeTextActive]}>★</Text>
              </View>
              <View style={styles.mpContent}>
                <Text style={styles.mpName}>Otro punto de la ruta</Text>
                <Text style={styles.mpDesc}>Márcalo en el mapa; el conductor lo verá antes de aceptarte.</Text>
              </View>
              <MaterialCommunityIcons
                name={joinChoice?.kind === 'proposed' ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={joinChoice?.kind === 'proposed' ? THEME.colors.primary : THEME.colors.borderSubtle}
              />
            </TouchableOpacity>

            {joinChoice?.kind === 'proposed' && (
              <View style={styles.proposedBox}>
                <View style={[styles.pickHint, proposedReady && styles.pickHintDone]}>
                  <MaterialCommunityIcons
                    name={proposedReady ? 'check-circle' : 'gesture-tap'}
                    size={18}
                    color={proposedReady ? THEME.colors.success : THEME.colors.primary}
                  />
                  <Text style={[styles.pickHintText, proposedReady && { color: THEME.colors.success }]}>
                    {proposedReady
                      ? 'Punto marcado (★ en el mapa). Toca otro lugar si quieres cambiarlo.'
                      : 'Toca el mapa de arriba en el lugar donde te unirás.'}
                  </Text>
                </View>
                <InputField
                  label="Nombre del lugar"
                  value={proposedName}
                  onChangeText={setProposedName}
                  placeholder="Ej. Esquina Av. Camelinas y Ventura Puente"
                  iconName="map-marker"
                  required={false}
                  maxLength={80}
                />
                <InputField
                  label="Nota para el conductor"
                  value={proposedNote}
                  onChangeText={setProposedNote}
                  placeholder="Ej. Frente al OXXO, llevo mochila azul"
                  iconName="message-text-outline"
                  required={false}
                  maxLength={160}
                />
              </View>
            )}
          </View>
        )}

        {trip.notes && (
          <View style={styles.notesBox}>
            <MaterialCommunityIcons name="information-outline" size={18} color={THEME.colors.accentDark} />
            <View style={styles.notesContent}>
              <Text style={styles.notesTitle}>Indicaciones adicionales del conductor:</Text>
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.actionCard}>
        {trip.status === 'finished' && trip.impact ? (
          <TripImpactBadge impact={trip.impact} asPassenger={!isDriver} />
        ) : null}

        {isDriver ? (
          <View>
            <View style={styles.noticeBox}>
              <MaterialCommunityIcons name="account-star" size={22} color={THEME.colors.primary} />
              <Text style={styles.noticeText}>
                {trip.status === 'finished'
                  ? trip.impact
                    ? 'Viaje finalizado. ¡Gracias por compartir tu trayecto!'
                    : 'Viaje finalizado sin pasajeros aceptados: no se registró CO₂ ahorrado.'
                  : trip.status === 'cancelled'
                  ? 'Cancelaste este viaje.'
                  : 'Este es tu viaje publicado. Puedes administrar las solicitudes desde Mis Viajes.'}
              </Text>
            </View>

            {(trip.status === 'published' || trip.status === 'in_progress') && (
              <TouchableOpacity
                style={[styles.finishBtn, !canFinishTrip(trip) && styles.finishBtnDisabled]}
                onPress={() => requestFinish(trip)}
                disabled={!canFinishTrip(trip) || finishingId === trip.id}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canFinishTrip(trip) }}
              >
                {finishingId === trip.id ? (
                  <ActivityIndicator size="small" color={THEME.colors.textInverse} />
                ) : (
                  <MaterialCommunityIcons
                    name="flag-checkered"
                    size={18}
                    color={canFinishTrip(trip) ? THEME.colors.textInverse : THEME.colors.textMuted}
                  />
                )}
                <Text style={[styles.finishBtnText, !canFinishTrip(trip) && styles.finishBtnTextDisabled]}>
                  {canFinishTrip(trip) ? 'Finalizar viaje' : `Podrás finalizar a partir de las ${timeFormatted}`}
                </Text>
              </TouchableOpacity>
            )}

            {onEditTrip && trip.status === 'published' && !isExpired && (
              canEditTrip(trip) ? (
                <TouchableOpacity style={styles.editBtn} onPress={() => onEditTrip(trip)} activeOpacity={0.8} accessibilityRole="button">
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={THEME.colors.primary} />
                  <Text style={styles.editBtnText}>Editar viaje</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.editHint}>
                  Ya tienes pasajeros aceptados: para cambiar la hora o el punto, cancela el viaje desde Mis Viajes y publica uno nuevo.
                </Text>
              )
            )}
          </View>
        ) : isAccepted ? (
          <View>
            <View style={styles.acceptedNotice}>
              <MaterialCommunityIcons name="check-decagram" size={26} color={THEME.colors.success} />
              <View style={styles.acceptedTextBox}>
                <Text style={styles.acceptedTitle}>¡Tu lugar está confirmado!</Text>
                <Text style={styles.acceptedSubtitle}>
                  Llega con 5 minutos de anticipación al punto de encuentro seleccionado.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelRequest}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={THEME.colors.error} />
              ) : (
                <>
                  <MaterialCommunityIcons name="close-circle-outline" size={18} color={THEME.colors.error} />
                  <Text style={styles.cancelBtnText}>Cancelar mi lugar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : isPending ? (
          <View>
            {isWaitlisted ? (
              <View style={styles.waitlistNotice}>
                <MaterialCommunityIcons name="account-clock" size={26} color={THEME.colors.warning} />
                <View style={styles.pendingTextBox}>
                  <Text style={styles.waitlistTitle}>Estás en lista de espera</Text>
                  <Text style={styles.pendingSubtitle}>
                    El viaje se llenó antes de que el conductor respondiera. Si alguien cancela te avisaremos y el
                    conductor podrá aceptarte. Mientras, puedes solicitar otro viaje a la misma hora.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.pendingNotice}>
                <MaterialCommunityIcons name="clock-outline" size={24} color={THEME.colors.accentDark} />
                <View style={styles.pendingTextBox}>
                  <Text style={styles.pendingTitle}>Solicitud pendiente de respuesta</Text>
                  <Text style={styles.pendingSubtitle}>
                    El conductor revisará tu solicitud y se te notificará cuando la acepte o rechace.
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelRequest}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={THEME.colors.error} />
              ) : (
                <>
                  <MaterialCommunityIcons name="close-circle-outline" size={18} color={THEME.colors.error} />
                  <Text style={styles.cancelBtnText}>
                    {isWaitlisted ? 'Salir de la lista de espera' : 'Cancelar solicitud pendiente'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : isUnavailable ? (
          <View style={styles.noticeBox}>
            <MaterialCommunityIcons name="cancel" size={22} color={THEME.colors.textMuted} />
            <Text style={styles.noticeText}>
              {trip.status === 'cancelled'
                ? 'Este viaje fue cancelado por el conductor.'
                : 'Este viaje ya no está disponible para nuevas solicitudes.'}
            </Text>
          </View>
        ) : isExpired ? (
          <View style={styles.noticeBox}>
            <MaterialCommunityIcons name="timer-off-outline" size={22} color={THEME.colors.textMuted} />
            <Text style={styles.noticeText}>
              Este viaje ya no está disponible porque la hora de salida ya pasó.
            </Text>
          </View>
        ) : isFull ? (
          <View style={styles.noticeBox}>
            <MaterialCommunityIcons name="car-off" size={22} color={THEME.colors.error} />
            <Text style={styles.noticeText}>
              Este viaje ha completado su capacidad de asientos.
            </Text>
          </View>
        ) : (
          <View>
            {!joinReady && (
              <Text style={styles.joinMissing}>
                {joinChoice?.kind === 'proposed'
                  ? 'Toca el mapa para marcar tu punto de unión.'
                  : 'Elige arriba dónde te unirás al viaje.'}
              </Text>
            )}
            {joinReady && chosenLabel() && (
              <Text style={styles.joinChosen}>Te unirás en: {chosenLabel()}</Text>
            )}
            <TouchableOpacity
              style={[styles.requestButton, (isSubmitting || !joinReady) && styles.requestButtonDisabled]}
              onPress={handleRequestTrip}
              disabled={isSubmitting || !joinReady}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="car-seat" size={22} color="#FFFFFF" />
                  <Text style={styles.requestButtonText}>Solicitar viaje</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  choiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    marginTop: 8,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  choiceItemActive: {
    borderColor: THEME.colors.primary,
    borderWidth: 1.5,
    backgroundColor: THEME.colors.primarySoft,
  },
  mpBadgeActive: {
    backgroundColor: THEME.colors.primary,
    borderWidth: 2,
    borderColor: THEME.colors.accent,
  },
  mpBadgeTextActive: {
    color: '#FFFFFF',
  },
  mpBadgeStar: {
    backgroundColor: THEME.colors.accentLight,
  },
  yourPointChip: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  yourPointChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  proposedBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  pickHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginBottom: 10,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.primarySoft,
  },
  pickHintDone: {
    backgroundColor: THEME.colors.successBg,
  },
  pickHintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  joinSavedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginTop: 4,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.primarySoft,
    borderWidth: 1,
    borderColor: THEME.colors.accent,
  },
  joinSavedLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accentDark,
    textTransform: 'uppercase',
  },
  joinSavedValue: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  joinSavedNote: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  joinMissing: {
    fontSize: 12,
    color: THEME.colors.warning,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  joinChosen: {
    fontSize: 12,
    color: THEME.colors.primary,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  waitlistNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: THEME.colors.warningBg,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1.5,
    borderColor: THEME.colors.warning,
  },
  waitlistTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.warning,
  },
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: THEME.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.successBorder,
    borderWidth: 1,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: THEME.borderRadius.md,
  },
  successBannerText: {
    flex: 1,
    color: THEME.colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: THEME.colors.errorBg,
    borderColor: THEME.colors.errorBorder,
    borderWidth: 1,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: THEME.borderRadius.md,
  },
  errorBannerText: {
    flex: 1,
    color: THEME.colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: THEME.colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  driverInfoText: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  driverAffiliation: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  roleTag: {
    backgroundColor: THEME.colors.primarySoft,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.pill,
    marginTop: 6,
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  vehicleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 14,
    padding: 12,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  vehicleDetails: {
    flex: 1,
  },
  vehicleModel: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  vehicleColor: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  platesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
  },
  platesLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  platesValue: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  platesProtected: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  estimateBox: {
    flexDirection: 'row',
    gap: 10,
  },
  estimateItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    padding: 10,
  },
  estimateValue: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  estimateSource: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 6,
    marginBottom: 12,
  },
  itineraryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  itineraryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  itineraryLabel: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  itineraryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 1,
  },
  itinerarySubtext: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  placesContainer: {
    marginVertical: 4,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  placeMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  placeTextBox: {
    flex: 1,
  },
  placeTypeLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  placeName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  verticalDottedLine: {
    width: 2,
    height: 22,
    backgroundColor: THEME.colors.border,
    marginLeft: 6,
    marginVertical: 2,
  },
  seatsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  seatsInfoText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  seatsNumber: {
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  mapTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 4,
  },
  meetingPointsList: {
    marginTop: 10,
  },
  meetingPointsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  meetingPointItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mpBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mpBadgeText: {
    color: '#1E293B',
    fontWeight: '800',
    fontSize: 11,
  },
  mpContent: {
    flex: 1,
  },
  mpName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  mpDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  mpCoords: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  notesBox: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF9C3',
    borderRadius: THEME.borderRadius.md,
    borderColor: '#FDE047',
    borderWidth: 1,
  },
  notesContent: {
    flex: 1,
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#854D0E',
  },
  notesText: {
    fontSize: 12,
    color: '#713F12',
    marginTop: 2,
    lineHeight: 18,
  },
  actionCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 24,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: THEME.colors.primary,
    paddingVertical: 14,
    borderRadius: THEME.borderRadius.lg,
    ...THEME.shadows.hover,
  },
  requestButtonDisabled: {
    opacity: 0.6,
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
    borderRadius: THEME.borderRadius.md,
    marginTop: 10,
  },
  cancelBtnText: {
    color: THEME.colors.error,
    fontWeight: '700',
    fontSize: 14,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  acceptedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: THEME.colors.successBg,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.successBorder,
  },
  acceptedTextBox: {
    flex: 1,
  },
  acceptedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.success,
  },
  acceptedSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: THEME.colors.warningBg,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.accent,
  },
  pendingTextBox: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.accentDark,
  },
  pendingSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.success,
    marginTop: 12,
  },
  finishBtnDisabled: {
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  finishBtnText: { fontSize: 14, fontWeight: '800', color: THEME.colors.textInverse },
  finishBtnTextDisabled: { color: THEME.colors.textMuted, fontWeight: '700', fontSize: 13 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    marginTop: 10,
  },
  editBtnText: { fontSize: 14, fontWeight: '800', color: THEME.colors.primary },
  editHint: { fontSize: 12, color: THEME.colors.textSecondary, marginTop: 10, textAlign: 'center' },
});

