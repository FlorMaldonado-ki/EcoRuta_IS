/** "Este viaje ahorró X kg de CO₂" en el detalle y en el historial. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { formatKg, formatKm } from '../utils/format';
import type { TripImpact } from '../types/api';

interface Props {
  impact: TripImpact;
  /** Soy pasajero: además del total del viaje, muestra lo que se me atribuye. */
  asPassenger?: boolean;
  compact?: boolean;
}

export const TripImpactBadge: React.FC<Props> = ({ impact, asPassenger = false, compact = false }) => (
  <View style={[styles.box, compact && styles.boxCompact]} accessibilityRole="summary">
    <MaterialCommunityIcons name="leaf" size={compact ? 16 : 22} color={THEME.colors.success} />
    <View style={styles.textCol}>
      <Text style={[styles.title, compact && styles.titleCompact]}>
        Este viaje ahorró {formatKg(impact.co2Kg)} de CO₂
      </Text>
      {!compact ? (
        <Text style={styles.detail}>
          {formatKm(impact.distanceKm)} × {impact.passengers} pasajero{impact.passengers === 1 ? '' : 's'} × {impact.emissionFactor} kg/km
          {asPassenger ? ` · tu aporte: ${formatKg(impact.passengerCo2Kg)}` : ''}
        </Text>
      ) : asPassenger ? (
        <Text style={styles.detail}>Tu aporte: {formatKg(impact.passengerCo2Kg)}</Text>
      ) : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: THEME.colors.successBg,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  boxCompact: { padding: 8, borderRadius: 8, marginTop: 8, gap: 8 },
  textCol: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: THEME.colors.success },
  titleCompact: { fontSize: 13 },
  detail: { fontSize: 12, color: THEME.colors.textSecondary, marginTop: 2 },
});
