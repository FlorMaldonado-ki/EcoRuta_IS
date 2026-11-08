import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Posición Y del bottom sheet: distancia desde la parte superior de la pantalla
const SHEET_HALF = SCREEN_HEIGHT * 0.52;   // media pantalla (~52% desde arriba)
const SHEET_FULL = 80;                      // casi pantalla completa (80px desde arriba)
const SNAP_THRESHOLD = 100;                 // px de arrastre para hacer snap
import { Header } from '../components/Header';
import { TripCard } from '../components/TripCard';
import { SelectModalField } from '../components/SelectModalField';
import { THEME } from '../constants/theme';
import { CAMPUS_REFERENCE_POINTS, MORELIA_ZONES } from '../constants/options';
import { searchTrips } from '../services/tripStorage';
import type { TripDTO, TripDirection, SearchTripsParams, UserDTO } from '../types/api';

interface PassengerSearchScreenProps {
  currentUser: UserDTO;
  onSelectTrip: (trip: TripDTO) => void;
  onBackToHome: () => void;
}

export const PassengerSearchScreen: React.FC<PassengerSearchScreenProps> = ({
  currentUser,
  onSelectTrip,
  onBackToHome,
}) => {
  // Estados de filtros
  const [selectedDirection, setSelectedDirection] = useState<'all' | TripDirection>('all');
  const [selectedCampus, setSelectedCampus] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'today' | 'tomorrow' | 'all'>('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all');
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [selectedRadius, setSelectedRadius] = useState<number>(0);
  const [minSeats, setMinSeats] = useState<number>(1);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  // Estados de carga y resultados
  const [isLoading, setIsLoading] = useState(false);
  const [trips, setTrips] = useState<TripDTO[]>([]);

  // ── Bottom Sheet ────────────────────────────────────────────────────────
  const [sheetExpanded, setSheetExpanded] = useState(false); // false = media, true = full
  const sheetY = useRef(new Animated.Value(SHEET_HALF)).current;
  const dragStartY = useRef(SHEET_HALF);

  const snapTo = useCallback((expanded: boolean) => {
    const toY = expanded ? SHEET_FULL : SHEET_HALF;
    Animated.spring(sheetY, {
      toValue: toY,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
    setSheetExpanded(expanded);
    dragStartY.current = toY;
  }, [sheetY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        // Captura el valor actual antes de empezar a arrastrar
        sheetY.stopAnimation((val) => {
          dragStartY.current = val;
          sheetY.setValue(val);
        });
      },
      onPanResponderMove: (_, gs) => {
        const newY = dragStartY.current + gs.dy;
        // Límites: no puede ir más arriba de SHEET_FULL ni más abajo de SHEET_HALF + 60
        const clamped = Math.max(SHEET_FULL, Math.min(SHEET_HALF + 60, newY));
        sheetY.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        const currentPos = dragStartY.current;
        if (currentPos <= SHEET_HALF) {
          // Estaba en media pantalla: sube si arrastró >threshold hacia arriba
          snapTo(gs.dy < -SNAP_THRESHOLD ? true : false);
        } else {
          // Estaba en pantalla completa: baja si arrastró >threshold hacia abajo
          snapTo(gs.dy > SNAP_THRESHOLD ? false : true);
        }
      },
    })
  ).current;

  // Opciones de puntos de campus (Campus 1, Campus 2, Metalurgia)
  const campusOptions = useMemo(() => {
    return [
      'Todos los campus',
      ...CAMPUS_REFERENCE_POINTS.map((c) => c.shortName),
    ];
  }, []);

  const campusMap: Record<string, string> = {
    'Todos los campus': 'all',
    'Campus 1': 'campus_1',
    'Campus 2': 'campus_2',
    Metalurgia: 'metalurgia',
  };

  // Opciones de zonas de Morelia
  const zoneOptions = useMemo(() => {
    return ['Cualquier zona', ...MORELIA_ZONES.map((z) => z.name)];
  }, []);

  // Ejecutar búsqueda cada vez que cambien los filtros
  useEffect(() => {
    fetchFilteredTrips();
  }, [
    selectedDirection,
    selectedCampus,
    selectedDateFilter,
    selectedTimeRange,
    selectedZone,
    selectedRadius,
    minSeats,
  ]);

  const fetchFilteredTrips = () => {
    setIsLoading(true);

    const now = new Date();
    let dateStr: string | undefined = undefined;
    if (selectedDateFilter === 'today') {
      dateStr = now.toISOString().split('T')[0];
    } else if (selectedDateFilter === 'tomorrow') {
      const tomorrow = new Date(now.getTime() + 24 * 3600_000);
      dateStr = tomorrow.toISOString().split('T')[0];
    }

    let timeFrom: string | undefined = undefined;
    let timeTo: string | undefined = undefined;
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

    let lat: number | undefined = undefined;
    let lng: number | undefined = undefined;
    if (selectedZone !== 'all') {
      const zoneObj = MORELIA_ZONES.find((z) => z.name === selectedZone);
      if (zoneObj) {
        lat = zoneObj.lat;
        lng = zoneObj.lng;
      }
    }

    const params: SearchTripsParams = {
      direction: selectedDirection === 'all' ? undefined : selectedDirection,
      campusPoint: selectedCampus === 'all' ? undefined : selectedCampus,
      date: dateStr,
      timeFrom,
      timeTo,
      lat,
      lng,
      radiusKm: selectedRadius > 0 ? selectedRadius : undefined,
      minSeats,
    };

    setTimeout(() => {
      const results = searchTrips(params, currentUser.id);
      setTrips(results);
      setIsLoading(false);
    }, 200);
  };

  const handleResetFilters = () => {
    setSelectedDirection('all');
    setSelectedCampus('all');
    setSelectedDateFilter('all');
    setSelectedTimeRange('all');
    setSelectedZone('all');
    setSelectedRadius(0);
    setMinSeats(1);
  };

  return (
    <View style={styles.container}>
      <Header subtitle="Búsqueda de Viajes" />

      {/* Barra superior de regreso y título */}
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
          <Text
            style={[styles.filterToggleText, isFilterExpanded && styles.filterToggleTextActive]}
          >
            Filtros
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pestañas rápidas de sentido */}
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
          <Text
            style={[styles.dirTabText, selectedDirection === 'to_campus' && styles.dirTabTextActive]}
          >
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
          <Text
            style={[styles.dirTabText, selectedDirection === 'from_campus' && styles.dirTabTextActive]}
          >
            Desde el Campus
          </Text>
        </TouchableOpacity>
      </View>

      {/* Panel colapsable de filtros detallados */}
      {isFilterExpanded && (
        <View style={styles.filterCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
            {/* Filtros de Fecha */}
            <TouchableOpacity
              style={[styles.chip, selectedDateFilter === 'all' && styles.chipActive]}
              onPress={() => setSelectedDateFilter('all')}
            >
              <Text style={[styles.chipText, selectedDateFilter === 'all' && styles.chipTextActive]}>
                Cualquier fecha
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chip, selectedDateFilter === 'today' && styles.chipActive]}
              onPress={() => setSelectedDateFilter('today')}
            >
              <Text style={[styles.chipText, selectedDateFilter === 'today' && styles.chipTextActive]}>
                Hoy
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chip, selectedDateFilter === 'tomorrow' && styles.chipActive]}
              onPress={() => setSelectedDateFilter('tomorrow')}
            >
              <Text
                style={[styles.chipText, selectedDateFilter === 'tomorrow' && styles.chipTextActive]}
              >
                Mañana
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Rango de Horario de Salida */}
          <View style={styles.filterSubSection}>
            <Text style={styles.filterSubLabel}>Horario de salida:</Text>
            <View style={styles.timeButtonsRow}>
              {[
                { key: 'all', label: 'Cualquiera' },
                { key: 'morning', label: 'Mañana (06:00 - 12:00)' },
                { key: 'afternoon', label: 'Tarde (12:00 - 18:00)' },
                { key: 'evening', label: 'Noche (18:00 - 22:00)' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.timeBtn, selectedTimeRange === t.key && styles.timeBtnActive]}
                  onPress={() => setSelectedTimeRange(t.key)}
                >
                  <Text
                    style={[
                      styles.timeBtnText,
                      selectedTimeRange === t.key && styles.timeBtnTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Puntos de referencia oficiales del TecNM (Campus 1, Campus 2, Metalurgia) */}
          <SelectModalField
            label="Punto del campus / Destino"
            placeholder="Selecciona Campus 1, 2 o Metalurgia"
            iconName="map-marker-radius"
            options={campusOptions}
            value={
              Object.keys(campusMap).find((k) => campusMap[k] === selectedCampus) || 'Todos los campus'
            }
            onSelect={(val) => setSelectedCampus(campusMap[val] || 'all')}
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

          {/* Radio de proximidad */}
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
                    <Text
                      style={[
                        styles.radiusBtnText,
                        selectedRadius === rad && styles.radiusBtnTextActive,
                      ]}
                    >
                      {rad} km
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Lugares mínimos requeridos */}
          <View style={styles.seatsFilterRow}>
            <Text style={styles.filterSubLabel}>Lugares requeridos:</Text>
            <View style={styles.seatsCountRow}>
              {[1, 2, 3, 4].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.seatCountBtn, minSeats === s && styles.seatCountBtnActive]}
                  onPress={() => setMinSeats(s)}
                >
                  <Text
                    style={[
                      styles.seatCountText,
                      minSeats === s && styles.seatCountTextActive,
                    ]}
                  >
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

      {/* ── Bottom Sheet de Resultados ─────────────────────────────────────── */}
      <Animated.View style={[styles.bottomSheet, { top: sheetY }]}>

        {/* Asa de arrastre — toca para hacer snap, o arrastra */}
        <View style={styles.sheetHandleArea} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>
              {trips.length} {trips.length === 1 ? 'viaje disponible' : 'viajes disponibles'}
            </Text>
            <View style={styles.resultsHeaderRight}>
              <Text style={styles.orderLabel}>Horario y cercanía</Text>
              {/* Botón de expand/collapse */}
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => snapTo(!sheetExpanded)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={sheetExpanded ? 'chevron-down' : 'chevron-up'}
                  size={22}
                  color={THEME.colors.primary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Lista de viajes */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
            <Text style={styles.loadingText}>Buscando rutas disponibles...</Text>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TripCard trip={item} onPress={() => onSelectTrip(item)} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="car-off" size={60} color={THEME.colors.textMuted} />
                <Text style={styles.emptyTitle}>No hay viajes con estos filtros</Text>
                <Text style={styles.emptySubtitle}>
                  Prueba cambiando la fecha, ampliando el rango de horario o limpiando los filtros de proximidad.
                </Text>
                <TouchableOpacity style={styles.emptyResetBtn} onPress={handleResetFilters}>
                  <Text style={styles.emptyResetBtnText}>Mostrar todos los viajes</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </Animated.View>
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
  listContent: {
    paddingBottom: 24,
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
