import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InteractiveMap } from '../components/InteractiveMap';
import { THEME } from '../constants/theme';
import { requestSeat, cancelReservation } from '../services/tripStorage';
import type { TripDTO, UserDTO } from '../types/api';

interface TripDetailScreenProps {
  trip: TripDTO;
  currentUser: UserDTO;
  onBack: () => void;
  onTripUpdated: (updatedTrip: TripDTO) => void;
}

export const TripDetailScreen: React.FC<TripDetailScreenProps> = ({
  trip,
  currentUser,
  onBack,
  onTripUpdated,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Formato de fechas y horas
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

  // Hora estimada de llegada
  let arrivalFormatted: string | null = null;
  if (trip.estimatedArrivalAt) {
    const arrDate = new Date(trip.estimatedArrivalAt);
    arrivalFormatted = arrDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  const isDriver = trip.driver.id === currentUser.id;
  const isAccepted = trip.userReservationStatus === 'aceptada';
  const isPending = trip.userReservationStatus === 'solicitada';
  const isFull = trip.seatsAvailable <= 0;
  const isExpired = new Date(trip.departureAt).getTime() <= Date.now();

  // Privacidad de placas (RNF-12): solo visible para el conductor o con reserva aceptada
  const canViewPlates = isDriver || isAccepted;

  const handleRequestTrip = () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    setTimeout(() => {
      const result = requestSeat(trip.id, {
        id: currentUser.id,
        fullName: currentUser.fullName,
        email: currentUser.email,
        photoUrl: currentUser.photoUrl,
      });

      setIsSubmitting(false);

      if (result.ok && result.reservation) {
        setSuccessMessage(result.message);
        onTripUpdated({
          ...trip,
          userReservationStatus: 'solicitada',
          userReservationId: result.reservation.id,
        });
      } else {
        setErrorMessage(result.message);
      }
    }, 400);
  };

  const handleCancelRequest = () => {
    if (!trip.userReservationId) return;

    Alert.alert(
      'Cancelar solicitud',
      '¿Estás seguro de que deseas cancelar tu solicitud de lugar para este viaje?',
      [
        { text: 'No, mantener', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => {
            setIsSubmitting(true);
            const result = cancelReservation(trip.userReservationId!, currentUser.id);
            setIsSubmitting(false);

            if (result.ok) {
              setSuccessMessage(result.message);
              onTripUpdated({
                ...trip,
                userReservationStatus: 'none',
                userReservationId: null,
                seatsAvailable: isAccepted
                  ? Math.min(trip.seatsTotal, trip.seatsAvailable + 1)
                  : trip.seatsAvailable,
              });
            } else {
              setErrorMessage(result.message);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="Detalles del Viaje" />

      {/* Botón de regreso */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backButtonText}>Volver a la búsqueda</Text>
        </TouchableOpacity>
      </View>

      {/* Banner de mensajes de éxito o error */}
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

      {/* Tarjeta de Información del Conductor */}
      <View style={styles.sectionCard}>
        <View style={styles.driverHeader}>
          {trip.driver.photoUrl ? (
            <Image source={{ uri: trip.driver.photoUrl }} style={styles.driverPhoto} />
          ) : (
            <View style={styles.driverAvatarFallback}>
              <Text style={styles.avatarInitials}>
                {trip.driver.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </Text>
            </View>
          )}

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

        {/* Información del Vehículo */}
        <View style={styles.vehicleBox}>
          <MaterialCommunityIcons name="car-info" size={20} color={THEME.colors.primary} />
          <View style={styles.vehicleDetails}>
            <Text style={styles.vehicleModel}>
              {trip.vehicle.brand} {trip.vehicle.model}
            </Text>
            <Text style={styles.vehicleColor}>Color: {trip.vehicle.color}</Text>
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

      {/* Tarjeta de Recorrido y Horarios */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Itinerario del Viaje</Text>

        <View style={styles.itineraryGrid}>
          {/* Salida */}
          <View style={styles.itineraryItem}>
            <MaterialCommunityIcons name="clock-start" size={20} color={THEME.colors.primary} />
            <View>
              <Text style={styles.itineraryLabel}>Hora de Salida</Text>
              <Text style={styles.itineraryValue}>{timeFormatted}</Text>
              <Text style={styles.itinerarySubtext}>{dateFormatted}</Text>
            </View>
          </View>

          {/* Llegada estimada */}
          {arrivalFormatted && (
            <View style={styles.itineraryItem}>
              <MaterialCommunityIcons name="clock-check-outline" size={20} color={THEME.colors.success} />
              <View>
                <Text style={styles.itineraryLabel}>Llegada Estimada</Text>
                <Text style={styles.itineraryValue}>{arrivalFormatted}</Text>
                <Text style={styles.itinerarySubtext}>Aprox. {trip.durationMin} min</Text>
              </View>
            </View>
          )}
        </View>

        {/* Origen y Destino */}
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

        {/* Lugares disponibles */}
        <View style={styles.seatsContainer}>
          <MaterialCommunityIcons name="seat-passenger" size={20} color={THEME.colors.primary} />
          <Text style={styles.seatsInfoText}>
            <Text style={styles.seatsNumber}>{trip.seatsAvailable}</Text> lugares disponibles de {trip.seatsTotal} ofrecidos
          </Text>
        </View>
      </View>

      {/* Mapa interactivo con Leaflet, OpenStreetMap y OSRM */}
      <View style={styles.sectionCard}>
        <View style={styles.mapTitleRow}>
          <MaterialCommunityIcons name="map-legend" size={20} color={THEME.colors.primary} />
          <Text style={styles.sectionTitle}>Recorrido y Puntos de Encuentro</Text>
        </View>
        <Text style={styles.mapSubtitle}>
          Trazado interactivo mediante OpenStreetMap y OSRM. Puedes ampliar o mover el mapa.
        </Text>

        <InteractiveMap
          origin={trip.origin}
          destination={trip.destination}
          meetingPoints={trip.meetingPoints}
          mode="view"
          height={320}
        />

        {/* Lista detallada de Puntos de Encuentro */}
        {trip.meetingPoints && trip.meetingPoints.length > 0 ? (
          <View style={styles.meetingPointsList}>
            <Text style={styles.meetingPointsTitle}>Paradas y Puntos de Encuentro acordados:</Text>
            {trip.meetingPoints.map((mp, index) => (
              <View key={mp.id || index} style={styles.meetingPointItem}>
                <View style={styles.mpBadge}>
                  <Text style={styles.mpBadgeText}>{mp.order || index + 1}</Text>
                </View>
                <View style={styles.mpContent}>
                  <Text style={styles.mpName}>{mp.name}</Text>
                  {mp.description ? <Text style={styles.mpDesc}>{mp.description}</Text> : null}
                  <Text style={styles.mpCoords}>
                    Coord: {mp.lat.toFixed(5)}, {mp.lng.toFixed(5)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Notas del conductor */}
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

      {/* ACCIONES Y BOTÓN DE SOLICITUD */}
      <View style={styles.actionCard}>
        {isDriver ? (
          <View style={styles.noticeBox}>
            <MaterialCommunityIcons name="account-star" size={22} color={THEME.colors.primary} />
            <Text style={styles.noticeText}>
              Este es tu viaje publicado. Puedes administrar las solicitudes desde "Mis Viajes".
            </Text>
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
            <View style={styles.pendingNotice}>
              <MaterialCommunityIcons name="clock-outline" size={24} color={THEME.colors.accentDark} />
              <View style={styles.pendingTextBox}>
                <Text style={styles.pendingTitle}>Solicitud pendiente de respuesta</Text>
                <Text style={styles.pendingSubtitle}>
                  El conductor revisará tu solicitud y se te notificará cuando la acepte o rechace.
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
                  <Text style={styles.cancelBtnText}>Cancelar solicitud pendiente</Text>
                </>
              )}
            </TouchableOpacity>
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
          <TouchableOpacity
            style={[styles.requestButton, isSubmitting && styles.requestButtonDisabled]}
            onPress={handleRequestTrip}
            disabled={isSubmitting}
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
        )}
      </View>
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
  driverPhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: THEME.colors.accent,
  },
  driverAvatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.accent,
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
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
});

