import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { TripCard } from '../components/TripCard';
import { SelectModalField } from '../components/SelectModalField';
import { THEME } from '../constants/theme';
import { CAMPUS_REFERENCE_POINTS, MORELIA_ZONES } from '../constants/options';
import { searchTrips, errorMessage, localYmd, type TripSearchFilters } from '../services/tripService';
import type { TripDTO, TripDirection, UserDTO } from '../types/api';
import { useNotifications } from '../hooks/useNotifications';

interface PassengerSearchScreenProps {
  currentUser: UserDTO;
  onSelectTrip: (trip: TripDTO) => void;
  onBackToHome: () => void;
}

type DateFilter = 'today' | 'tomorrow' | 'week';
const WEEK_DAYS = 7;

/** Fechas (AAAA-MM-DD, hora local) que cubre cada opción del filtro. */
function datesFor(filter: DateFilter): string[] {
  const now = Date.now();
  const day = (offset: number) => localYmd(new Date(now + offset * 24 * 3600_000));
  if (filter === 'today') return [day(0)];
  if (filter === 'tomorrow') return [day(1)];
  return Array.from({ length: WEEK_DAYS }, (_, i) => day(i));
}

const DATE_OPTIONS: { key: DateFilter; label: string }[] = [
  { key: 'week', label: `Próximos ${WEEK_DAYS} días` },
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
];

const TIME_OPTIONS = [
  { key: 'all', label: 'Cualquiera' },
  { key: 'morning', label: 'Mañana (06:00 - 12:00)' },
  { key: 'afternoon', label: 'Tarde (12:00 - 18:00)' },
  { key: 'evening', label: 'Noche (18:00 - 22:00)' },
];

const CAMPUS_MAP: Record<string, string> = {
  'Todos los campus': 'all',
  'Campus 1': 'campus_1',
  'Campus 2': 'campus_2',
  Metalurgia: 'metalurgia',
};

export const PassengerSearchScreen: React.FC<PassengerSearchScreenProps> = ({
  onSelectTrip,
  onBackToHome,
}) => {
  const [selectedDirection, setSelectedDirection] = useState<'all' | TripDirection>('all');
  const [selectedCampus, setSelectedCampus] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<DateFilter>('week');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all');
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [selectedRadius, setSelectedRadius] = useState<number>(0);
  const [minSeats, setMinSeats] = useState<number>(1);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trips, setTrips] = useState<TripDTO[]>([]);
  const requestId = useRef(0);
  const { summary, markSectionSeen } = useNotifications();

  const campusOptions = useMemo(
    () => ['Todos los campus', ...CAMPUS_REFERENCE_POINTS.map((c) => c.shortName)],
    []
  );
  const zoneOptions = useMemo(() => ['Cualquier zona', ...MORELIA_ZONES.map((z) => z.name)], []);

  const buildFilters = useCallback((): TripSearchFilters => {
    let timeFrom: string | undefined;
    let timeTo: string | undefined;
    if (selectedTimeRange === 'morning') {
      timeFrom = '06:00';
      timeTo = '12:00';
    } else if (selectedTimeRange === 'afternoon') {
      timeFrom = '12:00';
      timeTo = '18:00';
    } else if (selectedTimeRange === 'evening') {
      timeFrom = '18:00';
      timeTo = '22:00';
    }

    const zone = selectedZone !== 'all' ? MORELIA_ZONES.find((z) => z.name === selectedZone) : undefined;

    return {
      direction: selectedDirection === 'all' ? undefined : selectedDirection,
      campusPoint: selectedCampus === 'all' ? undefined : selectedCampus,
      dates: datesFor(selectedDateFilter),
      timeFrom,
      timeTo,
      lat: zone?.lat,
      lng: zone?.lng,
      radiusKm: selectedRadius > 0 ? selectedRadius : undefined,
      minSeats,
    };
  }, [selectedDirection, selectedCampus, selectedDateFilter, selectedTimeRange, selectedZone, selectedRadius, minSeats]);

  const fetchTrips = useCallback(
    async (mode: 'load' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'load') setIsLoading(true);
      else setIsRefreshing(true);
      setLoadError(null);
      try {
        const results = await searchTrips(buildFilters());
        if (id === requestId.current) setTrips(results);
      } catch (err) {
        if (id === requestId.current) {
          setTrips([]);
          setLoadError(errorMessage(err));
        }
      } finally {
        if (id === requestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [buildFilters]
  );

  useEffect(() => {
    fetchTrips('load');
  }, [fetchTrips]);

  // Si se publica un viaje mientras estás en la búsqueda, la lista se actualiza sola.
  useEffect(() => {
    if (summary.newTrips > 0) {
      fetchTrips('refresh');
      markSectionSeen('search');
    }
  }, [summary.newTrips, fetchTrips, markSectionSeen]);

  const handleResetFilters = () => {
    setSelectedDirection('all');
    setSelectedCampus('all');
    setSelectedDateFilter('week');
    setSelectedTimeRange('all');
    setSelectedZone('all');
    setSelectedRadius(0);
    setMinSeats(1);
  };

  const listHeader = (
    <View>
      <View style={styles.directionTabs}>
        <TouchableOpacity
          style={[styles.dirTab, selectedDirection === 'all' && styles.dirTabActive]}
          onPress={() => setSelectedDirection('all')}
        >
          <Text style={[styles.dirTabText, selectedDirection === 'all' && styles.dirTabTextActive]}>
            Todos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dirTab, selectedDirection === 'to_campus' && styles.dirTabActive]}
          onPress={() => setSelectedDirection('to_campus')}
        >
          <MaterialCommunityIcons
            name="school"
            size={14}
            color={selectedDirection === 'to_campus' ? '#fff' : THEME.colors.primary}
          />
          <Text style={[styles.dirTabText, selectedDirection === 'to_campus' && styles.dirTabTextActive]}>
            Hacia el Campus
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dirTab, selectedDirection === 'from_campus' && styles.dirTabActive]}
          onPress={() => setSelectedDirection('from_campus')}
        >
          <MaterialCommunityIcons
            name="home"
            size={14}
            color={selectedDirection === 'from_campus' ? '#fff' : THEME.colors.primary}
          />
          <Text style={[styles.dirTabText, selectedDirection === 'from_campus' && styles.dirTabTextActive]}>
            Desde el Campus
          </Text>
        </TouchableOpacity>
      </View>

      {/* Panel colapsable de filtros detallados */}
      {isFilterExpanded && (
        <View style={styles.filterCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
            {DATE_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d.key}
                style={[styles.chip, selectedDateFilter === d.key && styles.chipActive]}
                onPress={() => setSelectedDateFilter(d.key)}
              >
                <Text style={[styles.chipText, selectedDateFilter === d.key && styles.chipTextActive]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.filterSubSection}>
            <Text style={styles.filterSubLabel}>Horario de salida:</Text>
            <View style={styles.timeButtonsRow}>
              {TIME_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.timeBtn, selectedTimeRange === t.key && styles.timeBtnActive]}
                  onPress={() => setSelectedTimeRange(t.key)}
                >
                  <Text style={[styles.timeBtnText, selectedTimeRange === t.key && styles.timeBtnTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <SelectModalField
            label="Punto del campus / Destino"
            placeholder="Selecciona Campus 1, 2 o Metalurgia"
            iconName="map-marker-radius"
            options={campusOptions}
            value={Object.keys(CAMPUS_MAP).find((k) => CAMPUS_MAP[k] === selectedCampus) || 'Todos los campus'}
            onSelect={(val) => setSelectedCampus(CAMPUS_MAP[val] || 'all')}
          />

          {/* Zona de Morelia para cálculo de proximidad */}
          <SelectModalField
            label="Proximidad por zona de Morelia"
            placeholder="Selecciona zona para ordenar por cercanía"
            iconName="crosshairs-gps"
            options={zoneOptions}
            value={selectedZone === 'all' ? 'Cualquier zona' : selectedZone}
            onSelect={(val) => setSelectedZone(val === 'Cualquier zona' ? 'all' : val)}
          />

          {selectedZone !== 'all' && (
            <View style={styles.radiusContainer}>
              <Text style={styles.filterSubLabel}>Radio de cercanía máximo:</Text>
              <View style={styles.radiusRow}>
                {[1, 3, 5, 10].map((rad) => (
                  <TouchableOpacity
                    key={rad}
                    style={[styles.radiusBtn, selectedRadius === rad && styles.radiusBtnActive]}
                    onPress={() => setSelectedRadius(selectedRadius === rad ? 0 : rad)}
                  >
                    <Text style={[styles.radiusBtnText, selectedRadius === rad && styles.radiusBtnTextActive]}>
                      {rad} km
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.seatsFilterRow}>
            <Text style={styles.filterSubLabel}>Lugares requeridos:</Text>
            <View style={styles.seatsCountRow}>
              {[1, 2, 3, 4].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.seatCountBtn, minSeats === s && styles.seatCountBtnActive]}
                  onPress={() => setMinSeats(s)}
                >
                  <Text style={[styles.seatCountText, minSeats === s && styles.seatCountTextActive]}>
                    {s}+
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.resetBtn} onPress={handleResetFilters}>
            <MaterialCommunityIcons name="filter-remove-outline" size={16} color={THEME.colors.error} />
            <Text style={styles.resetBtnText}>Limpiar todos los filtros</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsCount}>
          {isLoading
            ? 'Buscando...'
            : `${trips.length} ${trips.length === 1 ? 'viaje disponible' : 'viajes disponibles'}`}
        </Text>
        <Text style={styles.orderLabel}>Horario y cercanía</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header subtitle="Búsqueda de Viajes" />

      <View style={styles.topNavigation}>
        <TouchableOpacity style={styles.backButton} onPress={onBackToHome} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backButtonText}>Inicio</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterToggleBtn, isFilterExpanded && styles.filterToggleBtnActive]}
          onPress={() => setIsFilterExpanded(!isFilterExpanded)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={18}
            color={isFilterExpanded ? '#FFFFFF' : THEME.colors.primary}
          />
          <Text style={[styles.filterToggleText, isFilterExpanded && styles.filterToggleTextActive]}>
            Filtros
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista desplazable: filtros + resultados */}
      <FlatList
        style={styles.list}
        data={isLoading ? [] : trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} onPress={() => onSelectTrip(item)} />}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchTrips('refresh')}
            colors={[THEME.colors.primary]}
            tintColor={THEME.colors.primary}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={THEME.colors.primary} />
              <Text style={styles.loadingText}>Buscando rutas disponibles...</Text>
            </View>
          ) : loadError ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="wifi-alert" size={60} color={THEME.colors.error} />
              <Text style={styles.emptyTitle}>No se pudieron cargar los viajes</Text>
              <Text style={styles.emptySubtitle}>{loadError}</Text>
              <TouchableOpacity style={styles.emptyResetBtn} onPress={() => fetchTrips('load')}>
                <Text style={styles.emptyResetBtnText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="car-off" size={60} color={THEME.colors.textMuted} />
              <Text style={styles.emptyTitle}>No hay viajes con estos filtros</Text>
              <Text style={styles.emptySubtitle}>
                Prueba cambiando la fecha, ampliando el rango de horario o limpiando los filtros de proximidad.
              </Text>
              <TouchableOpacity style={styles.emptyResetBtn} onPress={handleResetFilters}>
                <Text style={styles.emptyResetBtnText}>Limpiar filtros</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  topNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: THEME.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.borderRadius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.surfaceAlt,
  },
  filterToggleBtnActive: {
    backgroundColor: THEME.colors.primary,
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  filterToggleTextActive: {
    color: '#FFFFFF',
  },
  directionTabs: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  dirTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt,
  },
  dirTabActive: {
    backgroundColor: THEME.colors.primary,
  },
  dirTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  dirTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterCard: {
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  filterChipRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.pill,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: THEME.colors.primarySoft,
    borderColor: THEME.colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  filterSubSection: {
    marginBottom: 12,
  },
  filterSubLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 6,
  },
  timeButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  timeBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  timeBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  timeBtnText: {
    fontSize: 11,
    color: THEME.colors.textPrimary,
  },
  timeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  radiusContainer: {
    marginVertical: 8,
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  radiusBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  radiusBtnActive: {
    backgroundColor: THEME.colors.accent,
    borderColor: THEME.colors.accentDark,
  },
  radiusBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  radiusBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  seatsFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  seatsCountRow: {
    flexDirection: 'row',
    gap: 8,
  },
  seatCountBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seatCountBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  seatCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  seatCountTextActive: {
    color: '#FFFFFF',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  resetBtnText: {
    fontSize: 12,
    color: THEME.colors.error,
    fontWeight: '600',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  orderLabel: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  emptyResetBtn: {
    marginTop: 18,
    backgroundColor: THEME.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: THEME.borderRadius.md,
  },
  emptyResetBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
