import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InputField } from '../components/InputField';
import { THEME } from '../constants/theme';
import { getDriverRoute } from '../services/tripStorage';
import { publishTrip, updateTrip, errorMessage, localYmd } from '../services/tripService';
import { ApiError } from '../services/apiClient';
import { getMyVehicles } from '../services/vehicleService';
import type { DriverRoute, TripDTO, UserDTO } from '../types/api';
import { formatTripEstimate, estimateSourceLabel } from '../utils/tripEstimate';
import type { ApiVehicleDTO, ApiUpdateTripRequest } from '../types/apiBackend';

const NOTES_MAX = 300;
const MAX_POINTS = 8;

interface PublishTripScreenProps {
  currentUser: UserDTO;
  onBack: () => void;
  onGoToVehicleSetup: () => void;
  onGoToRouteSetup: () => void;
  onSuccessPublished: () => void;
  /** Con un viaje, la pantalla funciona como "Editar viaje" con sus datos precargados. */
  editingTrip?: TripDTO;
  onSuccessEdited?: (trip: TripDTO) => void;
}

const horaHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** El viaje que se edita, en la forma de ruta que usa el formulario. */
const routeFromTrip = (t: TripDTO): DriverRoute => ({
  id: t.id,
  direction: t.direction,
  campusPoint: t.campusPoint,
  origin: t.origin,
  destination: t.destination,
  meetingPoints: t.meetingPoints,
  isConfigured: true,
  distanceKm: t.distanceKm,
  updatedAt: t.departureAt,
});

/** Firma comparable de una lista de puntos (para saber si cambió). */
const firmaPuntos = (pts: { name: string; lat: number; lng: number }[]) =>
  pts.map((p) => `${p.name}|${p.lat}|${p.lng}`).join(';');

export const PublishTripScreen: React.FC<PublishTripScreenProps> = ({
  currentUser,
  onBack,
  onGoToVehicleSetup,
  onGoToRouteSetup,
  onSuccessPublished,
  editingTrip,
  onSuccessEdited,
}) => {
  const isEditing = !!editingTrip;
  const savedRoute = getDriverRoute();
  // En edición se usa el trayecto del viaje; opcionalmente se reemplaza por la ruta actual del conductor (el backend recalcula distancia y duración).
  const [useCurrentRoute, setUseCurrentRoute] = useState(false);
  const route = editingTrip && !useCurrentRoute ? routeFromTrip(editingTrip) : savedRoute;
  const savedRouteDiffers =
    isEditing && !!savedRoute && (savedRoute.meetingPoints || []).length > 0 &&
    (savedRoute.origin.lat !== editingTrip!.origin.lat || savedRoute.origin.lng !== editingTrip!.origin.lng ||
      savedRoute.destination.lat !== editingTrip!.destination.lat || savedRoute.destination.lng !== editingTrip!.destination.lng);

  // Vehículo registrado en el backend (fuente única: GET /api/me/vehiculos)
  const [vehicle, setVehicle] = useState<ApiVehicleDTO | null>(null);
  const [loadingVehicle, setLoadingVehicle] = useState(true);
  const maxSeats = vehicle?.maxSeats ?? 1;

  const [dateOption, setDateOption] = useState<'today' | 'tomorrow' | 'custom'>(isEditing ? 'custom' : 'today');
  const [customDate, setCustomDate] = useState<string>(
    editingTrip ? localYmd(new Date(editingTrip.departureAt)) : '',
  );

  // Generar sugerencia de hora válida (al menos 35 min en el futuro)
  const defaultDepartureTime = useMemo(() => {
    const d = new Date(Date.now() + 45 * 60_000);
    return d.toTimeString().substring(0, 5); // "HH:MM"
  }, []);

  const [departureTime, setDepartureTime] = useState<string>(
    editingTrip ? horaHHMM(new Date(editingTrip.departureAt)) : defaultDepartureTime,
  );
  const [seats, setSeats] = useState<number>(editingTrip?.seatsTotal ?? 1);
  const [notes, setNotes] = useState<string>(editingTrip?.notes ?? '');

  // Selección de puntos de encuentro que aplican a este viaje
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(
    new Set((route?.meetingPoints || []).map((p) => p.id))
  );
  // Al cambiar de trayecto (viaje ↔ ruta actual) se seleccionan todos los puntos del nuevo trayecto.
  useEffect(() => {
    if (!isEditing) return;
    setSelectedPointIds(new Set((route?.meetingPoints || []).map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCurrentRoute]);
  // 409 VIAJE_CON_RESERVAS: alguien fue aceptado mientras editabas → se sugiere cancelar.
  const [editConflict, setEditConflict] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [publishedTrip, setPublishedTrip] = useState<TripDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyVehicles()
      .then((list) => {
        if (cancelled) return;
        const v = list[0] ?? null;
        setVehicle(v);
        if (v) setSeats((s) => Math.min(Math.max(1, s), v.maxSeats) || 1);
      })
      .catch((err) => !cancelled && setErrorMsg(errorMessage(err)))
      .finally(() => !cancelled && setLoadingVehicle(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Fecha seleccionada (AAAA-MM-DD en hora local del dispositivo)
  const getSelectedIsoDate = (): string => {
    const now = new Date();
    if (dateOption === 'today') return localYmd(now);
    if (dateOption === 'tomorrow') return localYmd(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    return customDate.trim();
  };

  const toggleMeetingPoint = (id: string) => {
    setSelectedPointIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePublish = async () => {
    setErrorMsg(null);

    if (!vehicle) {
      setErrorMsg('Debes registrar tu vehículo antes de publicar un viaje.');
      return;
    }

    if (!route || !route.isConfigured || (route.meetingPoints || []).length === 0) {
      setErrorMsg('Debes configurar tu ruta y al menos un punto de encuentro antes de publicar.');
      return;
    }

    const isoDate = getSelectedIsoDate();
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      setErrorMsg('Por favor especifica una fecha válida (AAAA-MM-DD).');
      return;
    }

    if (!departureTime || !/^\d{2}:\d{2}$/.test(departureTime)) {
      setErrorMsg('Por favor especifica la hora de salida en formato HH:MM (ej. 07:30).');
      return;
    }

    const [hours, minutes] = departureTime.split(':').map(Number);
    const scheduledDateTime = new Date(`${isoDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);

    if (Number.isNaN(scheduledDateTime.getTime())) {
      setErrorMsg('La fecha u hora no es válida. Revisa el formato (AAAA-MM-DD y HH:MM).');
      return;
    }

    const now = Date.now();
    const minNoticeMs = 30 * 60_000; // mínimo 30 min de anticipación
    // En edición, la hora solo se valida si cambió (la API tampoco la revisa si no se envía).
    const departureChanged = !editingTrip ||
      Math.abs(scheduledDateTime.getTime() - new Date(editingTrip.departureAt).getTime()) >= 60_000;

    if (departureChanged && scheduledDateTime.getTime() <= now) {
      setErrorMsg('No puedes publicar un viaje en una fecha u hora que ya pasó.');
      return;
    }

    if (departureChanged && scheduledDateTime.getTime() < now + minNoticeMs) {
      setErrorMsg('Conforme a las reglas del programa (RN-04), debes publicar el viaje con al menos 30 minutos de anticipación.');
      return;
    }

    if (seats < 1 || seats > maxSeats) {
      setErrorMsg(`Tu vehículo permite ofrecer de 1 a ${maxSeats} lugar(es) (RN-03).`);
      return;
    }

    // Puntos de encuentro elegidos para este viaje: el pasajero los verá en el mapa y elegirá dónde unirse.
    const activeMeetingPoints = (route.meetingPoints || []).filter((p) => selectedPointIds.has(p.id));
    if (activeMeetingPoints.length === 0) {
      setErrorMsg('Elige al menos un punto de encuentro para este viaje.');
      return;
    }
    if (activeMeetingPoints.length > MAX_POINTS) {
      setErrorMsg(`Elige máximo ${MAX_POINTS} puntos de encuentro.`);
      return;
    }
    const trimmedNotes = notes.trim();
    if (trimmedNotes.length > NOTES_MAX) {
      setErrorMsg(`Las indicaciones no pueden pasar de ${NOTES_MAX} caracteres (llevas ${trimmedNotes.length}).`);
      return;
    }

    const meetingPointsBody = activeMeetingPoints
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ name: p.name, description: p.description || null, lat: p.lat, lng: p.lng }));

    if (editingTrip) {
      // Solo se envía lo que cambió (PATCH parcial).
      const changes: ApiUpdateTripRequest = {};
      if (departureChanged) changes.departureAt = scheduledDateTime.toISOString();
      if (seats !== editingTrip.seatsTotal) changes.seats = seats;
      if (trimmedNotes !== (editingTrip.notes ?? '')) changes.notes = trimmedNotes || null;
      if (useCurrentRoute) {
        changes.direction = route.direction;
        changes.campusPoint = route.campusPoint;
        if (route.direction === 'to_campus') changes.origin = route.origin;
        else changes.destination = route.destination;
      }
      if (useCurrentRoute || firmaPuntos(meetingPointsBody) !== firmaPuntos(editingTrip.meetingPoints)) {
        changes.meetingPoints = meetingPointsBody;
      }
      if (Object.keys(changes).length === 0) {
        setErrorMsg('No hiciste ningún cambio.');
        return;
      }
      setIsSubmitting(true);
      setEditConflict(false);
      try {
        const updated = await updateTrip(editingTrip.id, changes, currentUser);
        setPublishedTrip(updated);
        setShowSuccessModal(true);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VIAJE_CON_RESERVAS') setEditConflict(true);
        setErrorMsg(errorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await publishTrip(
        {
          vehicleId: vehicle.id,
          direction: route.direction,
          campusPoint: route.campusPoint,
          ...(route.direction === 'to_campus' ? { origin: route.origin } : { destination: route.destination }),
          departureAt: scheduledDateTime.toISOString(),
          seats,
          notes: trimmedNotes || null,
          meetingPoints: meetingPointsBody,
        },
        currentUser
      );
      setPublishedTrip(created);
      setShowSuccessModal(true);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validación de requisitos previos
  const hasVehicle = loadingVehicle || !!vehicle;
  const hasRoute = !!route && (route.meetingPoints || []).length > 0;
  const submitLabel = isEditing ? 'Guardar cambios' : 'Registrar Viaje';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle={isEditing ? 'Editar viaje' : 'Registro de Viaje Compartido'} />

      <View style={styles.body}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>

        {/* Alertas de requisitos previos */}
        {!hasVehicle && (
          <View style={styles.warningCard}>
            <MaterialCommunityIcons name="car-wrench" size={24} color={THEME.colors.warning} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Vehículo no registrado</Text>
              <Text style={styles.warningDesc}>
                Para ofrecer viajes necesitas registrar los datos de tu automóvil y tu fotografía de conductor.
              </Text>
              <TouchableOpacity
                style={styles.warningActionBtn}
                onPress={onGoToVehicleSetup}
                activeOpacity={0.8}
              >
                <Text style={styles.warningActionBtnText}>Registrar Vehículo y Foto</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!hasRoute && (
          <View style={styles.warningCard}>
            <MaterialCommunityIcons name="map-marker-alert" size={24} color={THEME.colors.warning} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Ruta no configurada</Text>
              <Text style={styles.warningDesc}>
                Debes definir tu ruta habitual y marcar tus puntos de encuentro en el mapa antes de publicar.
              </Text>
              <TouchableOpacity
                style={styles.warningActionBtn}
                onPress={onGoToRouteSetup}
                activeOpacity={0.8}
              >
                <Text style={styles.warningActionBtnText}>Configurar Ruta en el Mapa</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {errorMsg && (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={THEME.colors.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
        {editConflict && (
          <TouchableOpacity style={styles.warningActionBtn} onPress={onBack} activeOpacity={0.8}>
            <Text style={styles.warningActionBtnText}>Volver para cancelar el viaje</Text>
          </TouchableOpacity>
        )}

        {isEditing && savedRouteDiffers && (
          <TouchableOpacity
            style={[styles.meetingPointRow, useCurrentRoute && styles.meetingPointRowActive]}
            onPress={() => setUseCurrentRoute((v) => !v)}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: useCurrentRoute }}
          >
            <MaterialCommunityIcons
              name={useCurrentRoute ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={20}
              color={useCurrentRoute ? THEME.colors.primary : THEME.colors.textMuted}
            />
            <View style={styles.meetingPointInfo}>
              <Text style={[styles.meetingPointName, useCurrentRoute && styles.meetingPointNameActive]}>
                Usar mi ruta actual
              </Text>
              <Text style={styles.meetingPointDesc}>
                Cambia el punto de salida o llegada por el de tu ruta guardada; la distancia y la duración se recalculan.
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {route && (
          <View style={styles.sectionCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="routes" size={20} color={THEME.colors.primary} />
              <Text style={styles.cardTitle}>Trayecto de la Ruta</Text>
            </View>

            <View style={styles.routeTraceBox}>
              <View style={styles.routePointRow}>
                <View style={[styles.dot, { backgroundColor: THEME.colors.success }]} />
                <View style={styles.routePointTextCol}>
                  <Text style={styles.routePointLabel}>Origen</Text>
                  <Text style={styles.routePointValue}>{route.origin.text}</Text>
                </View>
              </View>

              <View style={styles.routeLine} />

              <View style={styles.routePointRow}>
                <View style={[styles.dot, { backgroundColor: THEME.colors.primary }]} />
                <View style={styles.routePointTextCol}>
                  <Text style={styles.routePointLabel}>Destino</Text>
                  <Text style={styles.routePointValue}>{route.destination.text}</Text>
                </View>
              </View>
            </View>

            {/* Puntos de encuentro activos */}
            <Text style={styles.subSectionTitle}>Puntos de encuentro para este viaje:</Text>
            {route.meetingPoints && route.meetingPoints.length > 0 ? (
              route.meetingPoints.map((mp) => {
                const isSelected = selectedPointIds.has(mp.id);
                return (
                  <TouchableOpacity
                    key={mp.id}
                    style={[
                      styles.meetingPointRow,
                      isSelected && styles.meetingPointRowActive,
                    ]}
                    onPress={() => toggleMeetingPoint(mp.id)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                      size={20}
                      color={isSelected ? THEME.colors.primary : THEME.colors.textMuted}
                    />
                    <View style={styles.meetingPointInfo}>
                      <Text
                        style={[
                          styles.meetingPointName,
                          isSelected && styles.meetingPointNameActive,
                        ]}
                      >
                        {mp.name}
                      </Text>
                      {mp.description ? (
                        <Text style={styles.meetingPointDesc}>{mp.description}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.emptyPointsNotice}>
                No hay puntos de encuentro guardados.
              </Text>
            )}
          </View>
        )}

        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <MaterialCommunityIcons name="clock-outline" size={20} color={THEME.colors.primary} />
            <Text style={styles.cardTitle}>Horario y Lugares</Text>
          </View>

          <Text style={styles.inputGroupLabel}>Fecha del viaje</Text>
          <View style={styles.dateSelectorRow}>
            <TouchableOpacity
              style={[
                styles.dateChip,
                dateOption === 'today' && styles.dateChipActive,
              ]}
              onPress={() => setDateOption('today')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateChipText,
                  dateOption === 'today' && styles.dateChipTextActive,
                ]}
              >
                Hoy
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.dateChip,
                dateOption === 'tomorrow' && styles.dateChipActive,
              ]}
              onPress={() => setDateOption('tomorrow')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateChipText,
                  dateOption === 'tomorrow' && styles.dateChipTextActive,
                ]}
              >
                Mañana
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.dateChip,
                dateOption === 'custom' && styles.dateChipActive,
              ]}
              onPress={() => setDateOption('custom')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateChipText,
                  dateOption === 'custom' && styles.dateChipTextActive,
                ]}
              >
                Otra fecha
              </Text>
            </TouchableOpacity>
          </View>

          {dateOption === 'custom' && (
            <InputField
              label="Fecha personalizada (AAAA-MM-DD)"
              value={customDate}
              onChangeText={setCustomDate}
              placeholder="Ej. 2026-11-10"
              iconName="calendar"
            />
          )}

          <InputField
            label="Hora de salida (Formato 24h: HH:MM)"
            value={departureTime}
            onChangeText={setDepartureTime}
            placeholder="Ej. 07:30"
            iconName="clock-time-four-outline"
          />

          <View style={styles.rnNoticeBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color={THEME.colors.primary} />
            <Text style={styles.rnNoticeText}>
              Regla de negocio (RN-04): Se requiere publicar con al menos 30 minutos de anticipación.
            </Text>
          </View>

          <Text style={styles.inputGroupLabel}>Lugares disponibles a ofrecer</Text>
          <View style={styles.stepperContainer}>
            <TouchableOpacity
              style={[styles.stepperBtn, seats <= 1 && styles.stepperBtnDisabled]}
              onPress={() => setSeats((s) => Math.max(1, s - 1))}
              disabled={seats <= 1}
            >
              <MaterialCommunityIcons name="minus" size={20} color={THEME.colors.primary} />
            </TouchableOpacity>

            <View style={styles.stepperValueBox}>
              <Text style={styles.stepperValueText}>{seats}</Text>
              <Text style={styles.stepperSubtext}>
                {seats === 1 ? 'lugar' : 'lugares'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.stepperBtn, seats >= maxSeats && styles.stepperBtnDisabled]}
              onPress={() => setSeats((s) => Math.min(maxSeats, s + 1))}
              disabled={seats >= maxSeats}
            >
              <MaterialCommunityIcons name="plus" size={20} color={THEME.colors.primary} />
            </TouchableOpacity>
          </View>

          <InputField
            label="Comentarios o indicaciones para tus pasajeros (Opcional)"
            value={notes}
            onChangeText={setNotes}
            required={false}
            placeholder="Ej. Llevar credencial del Tec a la mano, auto con cajuela libre."
            iconName="card-text-outline"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.publishBtn,
            (!vehicle || !hasRoute || isSubmitting) && styles.publishBtnDisabled,
          ]}
          onPress={handlePublish}
          disabled={!vehicle || !hasRoute || isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={THEME.colors.textInverse} />
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={THEME.colors.textInverse} />
              <Text style={styles.publishBtnText}>{submitLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successBadge}>
              <MaterialCommunityIcons name="check" size={42} color={THEME.colors.textInverse} />
            </View>

            <Text style={styles.modalSuccessTitle}>
              {isEditing ? '¡Cambios guardados!' : '¡Viaje Registrado con Éxito!'}
            </Text>
            <Text style={styles.modalSuccessMsg}>
              {isEditing
                ? 'Tu viaje se actualizó. Quienes lo busquen verán ya la información nueva.'
                : 'Tu viaje compartido ha sido publicado en EcoRuta Escolar. Los pasajeros de la comunidad TecNM podrán consultar tu ruta y solicitar un lugar.'}
            </Text>

            {publishedTrip && (
              <Text style={styles.modalEstimate}>
                Trayecto estimado: {formatTripEstimate(publishedTrip)}
                {'\n'}
                <Text style={styles.modalEstimateSource}>{estimateSourceLabel(publishedTrip)}</Text>
              </Text>
            )}

            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={() => {
                setShowSuccessModal(false);
                if (isEditing && publishedTrip) onSuccessEdited?.(publishedTrip);
                else onSuccessPublished();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalPrimaryBtnText}>{isEditing ? 'Listo' : 'Ver Mis Viajes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  modalEstimate: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalEstimateSource: {
    fontSize: 11,
    fontWeight: '500',
    color: THEME.colors.textMuted,
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
  warningCard: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.warningBg,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.warningBorder,
    padding: 16,
    gap: 12,
    marginBottom: 16,
    ...THEME.shadows.card,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.warning,
  },
  warningDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  warningActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.warningBorder,
    borderRadius: THEME.borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  warningActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.warning,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.errorBg,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: THEME.colors.error,
    fontWeight: '600',
    flex: 1,
  },
  sectionCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 18,
    marginBottom: 16,
    ...THEME.shadows.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  routeTraceBox: {
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 14,
    borderRadius: THEME.borderRadius.md,
    marginBottom: 14,
  },
  routePointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeLine: {
    width: 2,
    height: 18,
    backgroundColor: THEME.colors.border,
    marginLeft: 5,
    marginVertical: 2,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routePointTextCol: {
    flex: 1,
  },
  routePointLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
  },
  routePointValue: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 1,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 10,
  },
  meetingPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 12,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 10,
    marginBottom: 8,
  },
  meetingPointRowActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primarySoft,
  },
  meetingPointInfo: {
    flex: 1,
  },
  meetingPointName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  meetingPointNameActive: {
    color: THEME.colors.primary,
  },
  meetingPointDesc: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 1,
  },
  emptyPointsNotice: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
  },
  inputGroupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
    marginTop: 6,
  },
  dateSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dateChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    alignItems: 'center',
  },
  dateChipActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primarySoft,
  },
  dateChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  dateChipTextActive: {
    color: THEME.colors.primary,
  },
  rnNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primarySoft,
    padding: 10,
    borderRadius: THEME.borderRadius.sm,
    gap: 8,
    marginTop: -6,
    marginBottom: 14,
  },
  rnNoticeText: {
    fontSize: 11,
    color: THEME.colors.primary,
    flex: 1,
    fontWeight: '600',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 8,
    gap: 20,
    marginBottom: 14,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperValueBox: {
    alignItems: 'center',
    minWidth: 80,
  },
  stepperValueText: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  stepperSubtext: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontWeight: '600',
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.md,
    height: 52,
    gap: 10,
    marginTop: 6,
    ...THEME.shadows.hover,
  },
  publishBtnDisabled: {
    opacity: 0.5,
  },
  publishBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textInverse,
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
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalSuccessTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSuccessMsg: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalPrimaryBtn: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: THEME.borderRadius.md,
    width: '100%',
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
});
