/**
 * SCRUM-66 · RF-23: "Mi impacto". CO₂ ahorrado hoy y en total (kg), desglose
 * como conductor y como pasajero, y la lista de viajes con el CO₂ atribuido.
 * Los totales vienen del estado compartido (useImpact): si se finaliza un viaje
 * se actualizan solos (RF-26).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { THEME } from '../constants/theme';
import { useImpact } from '../hooks/useImpact';
import { getMyImpactTrips } from '../services/catalogService';
import { errorMessage } from '../services/tripService';
import { formatKg, formatKm } from '../utils/format';
import type { MyImpactTripDTO, UserDTO } from '../types/api';

interface MyImpactScreenProps {
  currentUser: UserDTO;
  onBack: () => void;
  onGoToSearch: () => void;
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

export const MyImpactScreen: React.FC<MyImpactScreenProps> = ({ onBack, onGoToSearch }) => {
  const { mine, mineStatus, mineError, version, refresh } = useImpact();
  const [trips, setTrips] = useState<MyImpactTripDTO[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrips = useCallback(async (p: number) => {
    setLoadingTrips(true);
    setTripsError(null);
    try {
      const res = await getMyImpactTrips(p);
      setTrips((prev) => (p === 1 ? res.items : [...prev, ...res.items]));
      setPage(p);
      setHasMore(res.hasMore);
    } catch (err) {
      setTripsError(errorMessage(err));
    } finally {
      setLoadingTrips(false);
    }
  }, []);

  // Primera carga y cada vez que el impacto cambia (se finalizó un viaje).
  useEffect(() => { loadTrips(1); }, [loadTrips, version]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadTrips(1)]);
    setRefreshing(false);
  };

  const sinViajes = mineStatus === 'ready' && (mine?.trips ?? 0) === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Header subtitle="Mi impacto ecológico" />
      <View style={styles.body}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8} accessibilityRole="button">
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>

        {mineStatus === 'error' && !mine ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="cloud-alert" size={22} color={THEME.colors.error} />
            <Text style={styles.errorText}>{mineError ?? 'No pudimos cargar tu impacto.'}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.8}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Hoy y total */}
        <View style={styles.cardsRow}>
          <View style={[styles.bigCard, styles.todayCard]}>
            <Text style={styles.bigLabel}>Hoy</Text>
            {mineStatus === 'loading' && !mine ? (
              <ActivityIndicator color={THEME.colors.textInverse} />
            ) : (
              <Text style={styles.bigNumber}>{formatKg(mine?.co2TodayKg ?? 0)}</Text>
            )}
            <Text style={styles.bigSub}>de CO₂ ahorrado</Text>
          </View>
          <View style={[styles.bigCard, styles.totalCard]}>
            <Text style={[styles.bigLabel, styles.darkText]}>Total</Text>
            {mineStatus === 'loading' && !mine ? (
              <ActivityIndicator color={THEME.colors.primary} />
            ) : (
              <Text style={[styles.bigNumber, styles.darkText]}>{formatKg(mine?.co2TotalKg ?? 0)}</Text>
            )}
            <Text style={[styles.bigSub, styles.mutedText]}>
              en {mine?.trips ?? 0} viaje{mine?.trips === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {sinViajes ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="sprout" size={40} color={THEME.colors.success} />
            <Text style={styles.emptyTitle}>Aún no tienes viajes finalizados</Text>
            <Text style={styles.emptyText}>
              Cada viaje compartido evita emisiones. Busca un viaje como pasajero o publica el tuyo y empieza a sumar.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={onGoToSearch} activeOpacity={0.8}>
              <MaterialCommunityIcons name="magnify" size={18} color={THEME.colors.textInverse} />
              <Text style={styles.primaryBtnText}>Buscar un viaje</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Desglose conductor / pasajero */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>¿Cómo lo lograste?</Text>
              <View style={styles.breakRow}>
                <MaterialCommunityIcons name="steering" size={22} color={THEME.colors.primary} />
                <View style={styles.breakText}>
                  <Text style={styles.breakLabel}>Como conductor</Text>
                  <Text style={styles.breakSub}>
                    {mine?.asDriver?.trips ?? 0} viaje{mine?.asDriver?.trips === 1 ? '' : 's'} · todos tus pasajeros cuentan
                  </Text>
                </View>
                <Text style={styles.breakValue}>{formatKg(mine?.asDriver?.co2TotalKg ?? 0)}</Text>
              </View>
              <View style={styles.breakRow}>
                <MaterialCommunityIcons name="seat-passenger" size={22} color={THEME.colors.primary} />
                <View style={styles.breakText}>
                  <Text style={styles.breakLabel}>Como pasajero</Text>
                  <Text style={styles.breakSub}>
                    {mine?.asPassenger?.trips ?? 0} viaje{mine?.asPassenger?.trips === 1 ? '' : 's'} · tu asiento cuenta
                  </Text>
                </View>
                <Text style={styles.breakValue}>{formatKg(mine?.asPassenger?.co2TotalKg ?? 0)}</Text>
              </View>
              {mine?.kmAvoided ? (
                <Text style={styles.kmNote}>Equivale a {formatKm(mine.kmAvoided)} que no se recorrieron en auto.</Text>
              ) : null}
            </View>

            {/* Viajes con su CO₂ */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Tus viajes</Text>
              {tripsError ? (
                <View style={styles.inlineError}>
                  <Text style={styles.errorText}>{tripsError}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => loadTrips(page)} activeOpacity={0.8}>
                    <Text style={styles.retryText}>Reintentar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {trips.map((t) => (
                <View key={`${t.tripId}-${t.role}`} style={styles.tripRow}>
                  <View style={styles.tripIcon}>
                    <MaterialCommunityIcons
                      name={t.role === 'driver' ? 'steering' : 'seat-passenger'}
                      size={18}
                      color={THEME.colors.primary}
                    />
                  </View>
                  <View style={styles.tripText}>
                    <Text style={styles.tripRoute} numberOfLines={1}>{t.origin} → {t.destination}</Text>
                    <Text style={styles.tripSub}>
                      {fechaCorta(t.finishedAt ?? t.departureAt)} · {t.role === 'driver' ? `conductor, ${t.passengers} pasajero${t.passengers === 1 ? '' : 's'}` : 'pasajero'} · {formatKm(t.distanceKm)}
                    </Text>
                  </View>
                  <Text style={styles.tripCo2}>{formatKg(t.co2Kg)}</Text>
                </View>
              ))}
              {loadingTrips ? <ActivityIndicator style={styles.loader} color={THEME.colors.primary} /> : null}
              {!loadingTrips && hasMore ? (
                <TouchableOpacity style={styles.moreBtn} onPress={() => loadTrips(page + 1)} activeOpacity={0.8}>
                  <Text style={styles.moreText}>Ver más viajes</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  content: { paddingBottom: 40 },
  body: { padding: 16, maxWidth: 600, width: '100%', alignSelf: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: THEME.colors.primary },
  cardsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  bigCard: { flex: 1, borderRadius: 16, padding: 16, minHeight: 120, justifyContent: 'center' },
  todayCard: { backgroundColor: THEME.colors.primary },
  totalCard: { backgroundColor: THEME.colors.surface, borderWidth: 1, borderColor: THEME.colors.border },
  bigLabel: { fontSize: 13, fontWeight: '700', color: THEME.colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  bigNumber: { fontSize: 26, fontWeight: '900', color: THEME.colors.textInverse, marginVertical: 4 },
  bigSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  darkText: { color: THEME.colors.primary },
  mutedText: { color: THEME.colors.textSecondary },
  sectionCard: { backgroundColor: THEME.colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: THEME.colors.border },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: THEME.colors.textPrimary, marginBottom: 10 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: THEME.colors.border },
  breakText: { flex: 1 },
  breakLabel: { fontSize: 14, fontWeight: '700', color: THEME.colors.textPrimary },
  breakSub: { fontSize: 12, color: THEME.colors.textSecondary },
  breakValue: { fontSize: 15, fontWeight: '800', color: THEME.colors.success },
  kmNote: { fontSize: 12, color: THEME.colors.textSecondary, marginTop: 8 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: THEME.colors.border },
  tripIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: THEME.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tripText: { flex: 1 },
  tripRoute: { fontSize: 13, fontWeight: '700', color: THEME.colors.textPrimary },
  tripSub: { fontSize: 11, color: THEME.colors.textSecondary, marginTop: 2 },
  tripCo2: { fontSize: 14, fontWeight: '800', color: THEME.colors.success },
  loader: { marginVertical: 12 },
  moreBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  moreText: { fontSize: 14, fontWeight: '700', color: THEME.colors.primary },
  emptyCard: { backgroundColor: THEME.colors.surface, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: THEME.colors.border },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: THEME.colors.textPrimary, textAlign: 'center' },
  emptyText: { fontSize: 13, color: THEME.colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: THEME.colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, marginTop: 8 },
  primaryBtnText: { color: THEME.colors.textInverse, fontWeight: '800', fontSize: 14 },
  errorBox: { backgroundColor: THEME.colors.errorBg, borderRadius: 12, padding: 14, alignItems: 'center', gap: 8, marginBottom: 14 },
  inlineError: { alignItems: 'center', gap: 6, marginBottom: 8 },
  errorText: { fontSize: 13, color: THEME.colors.error, textAlign: 'center' },
  retryBtn: { borderWidth: 1, borderColor: THEME.colors.error, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14 },
  retryText: { color: THEME.colors.error, fontWeight: '700', fontSize: 13 },
});
