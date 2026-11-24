import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import type { TripDTO } from '../types/api';
import { formatTripEstimate } from '../utils/tripEstimate';
import { DriverAvatar } from './DriverAvatar';

interface TripCardProps {
  trip: TripDTO;
  onPress: () => void;
}

export const TripCard: React.FC<TripCardProps> = ({ trip, onPress }) => {
  const depDate = new Date(trip.departureAt);
  const timeFormatted = depDate.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const isToday = depDate.toDateString() === new Date().toDateString();
  const dateFormatted = isToday
    ? 'Hoy'
    : depDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

  const isFull = trip.seatsAvailable <= 0;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.timeTag}>
          <MaterialCommunityIcons name="clock-outline" size={15} color={THEME.colors.primary} />
          <Text style={styles.timeText}>{dateFormatted} · {timeFormatted}</Text>
        </View>

        <View style={[styles.seatsBadge, isFull ? styles.seatsBadgeFull : styles.seatsBadgeAvailable]}>
          <MaterialCommunityIcons
            name={isFull ? 'car-off' : 'seat-passenger'}
            size={14}
            color={isFull ? THEME.colors.error : THEME.colors.success}
          />
          <Text style={[styles.seatsText, isFull ? styles.seatsTextFull : styles.seatsTextAvailable]}>
            {isFull ? 'Lleno' : `${trip.seatsAvailable} disp.`}
          </Text>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.routeIndicator}>
          <View style={styles.originDot} />
          <View style={styles.routeLine} />
          <View style={styles.destDot} />
        </View>

        <View style={styles.routeDetails}>
          <View style={styles.placeItem}>
            <Text style={styles.placeLabel}>Origen</Text>
            <Text style={styles.placeText} numberOfLines={1}>
              {trip.origin.text}
            </Text>
          </View>

          <View style={styles.placeItem}>
            <Text style={styles.placeLabel}>Destino</Text>
            <Text style={[styles.placeText, styles.destText]} numberOfLines={1}>
              {trip.destination.text}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.estimateRow}>
        <MaterialCommunityIcons name="map-marker-path" size={13} color={THEME.colors.textSecondary} />
        <Text style={styles.estimateText}>
          {formatTripEstimate(trip)}
          {trip.distanceSource === 'haversine' ? ' (aprox.)' : ''}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Las placas no se muestran aquí: solo con reserva aceptada. */}
      <View style={styles.footerRow}>
        <View style={styles.driverInfo}>
          <DriverAvatar fullName={trip.driver.fullName} photoUrl={trip.driver.photoUrl} size={36} />

          <View style={styles.driverTextColumn}>
            <View style={styles.driverNameRow}>
              <Text style={styles.driverName} numberOfLines={1}>
                {trip.driver.fullName}
              </Text>
              <MaterialCommunityIcons name="shield-check" size={14} color={THEME.colors.primary} />
            </View>

            <View style={styles.vehicleRow}>
              <MaterialCommunityIcons name="car-side" size={13} color={THEME.colors.textSecondary} />
              <Text style={styles.vehicleText} numberOfLines={1}>
                {trip.vehicle.brand} {trip.vehicle.model} · Color {trip.vehicle.color}
              </Text>
            </View>
          </View>
        </View>

        {trip.userReservationStatus && trip.userReservationStatus !== 'none' && (
          <View
            style={[
              styles.userStatusBadge,
              trip.userReservationStatus === 'aceptada'
                ? styles.badgeAccepted
                : trip.userReservationStatus === 'solicitada'
                ? styles.badgePending
                : styles.badgeRejected,
            ]}
          >
            <Text
              style={[
                styles.userStatusText,
                trip.userReservationStatus === 'aceptada'
                  ? styles.textAccepted
                  : trip.userReservationStatus === 'solicitada'
                  ? styles.textPending
                  : styles.textRejected,
              ]}
            >
              {trip.userReservationStatus === 'aceptada'
                ? 'Lugar asignado'
                : trip.userReservationStatus === 'solicitada'
                ? 'Solicitud pendiente'
                : 'Rechazada'}
            </Text>
          </View>
        )}
      </View>

      {trip.distanceFromYouKm !== undefined && (
        <View style={styles.proximityRow}>
          <MaterialCommunityIcons name="map-marker-distance" size={12} color={THEME.colors.accentDark} />
          <Text style={styles.proximityText}>A {trip.distanceFromYouKm} km de tu búsqueda</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.detailsBtn}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalles del viaje de ${trip.driver.fullName}, ${dateFormatted} a las ${timeFormatted}`}
      >
        <MaterialCommunityIcons name="text-box-search-outline" size={18} color={THEME.colors.textInverse} />
        <Text style={styles.detailsBtnText}>Ver detalles</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={THEME.colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    padding: 14,
    marginVertical: 6,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.colors.primarySoft,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.sm,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  seatsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.pill,
  },
  seatsBadgeAvailable: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.successBorder,
    borderWidth: 1,
  },
  seatsBadgeFull: {
    backgroundColor: THEME.colors.errorBg,
    borderColor: THEME.colors.errorBorder,
    borderWidth: 1,
  },
  seatsText: {
    fontSize: 11,
    fontWeight: '700',
  },
  seatsTextAvailable: {
    color: THEME.colors.success,
  },
  seatsTextFull: {
    color: THEME.colors.error,
  },
  routeContainer: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  routeIndicator: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  originDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.success,
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 2,
  },
  destDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.primary,
  },
  routeDetails: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'space-between',
    gap: 6,
  },
  placeItem: {
    justifyContent: 'center',
  },
  placeLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  placeText: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    fontWeight: '600',
  },
  destText: {
    color: THEME.colors.primaryDark,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  driverTextColumn: {
    flex: 1,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  driverName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  vehicleText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  userStatusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.pill,
    borderWidth: 1,
    marginLeft: 6,
  },
  badgeAccepted: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.successBorder,
  },
  badgePending: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.accent,
  },
  badgeRejected: {
    backgroundColor: THEME.colors.errorBg,
    borderColor: THEME.colors.errorBorder,
  },
  userStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textAccepted: { color: THEME.colors.success },
  textPending: { color: THEME.colors.warning },
  textRejected: { color: THEME.colors.error },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  estimateText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  proximityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  proximityText: {
    fontSize: 11,
    color: THEME.colors.accentDark,
    fontWeight: '600',
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    minHeight: 44,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.primary,
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
});

