/**
 * Sección "Personas del viaje" en el detalle (RF-27, RF-28).
 *   - Conductor: ve a sus pasajeros aceptados → Calificar (al finalizar) / Reportar.
 *   - Pasajero aceptado: ve al conductor → Calificar (al finalizar) / Reportar.
 *   - Pasajero con solicitud no aceptada: solo puede reportar al conductor.
 */
import React, { useCallback, useState } from 'react';
import { useLoader } from '../../hooks/useLoader';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { DriverAvatar } from '../DriverAvatar';
import { getTripParticipants } from '../../services/trustService';
import { RateUserModal } from './RateUserModal';
import { ReportUserModal } from './ReportUserModal';
import { Button, ErrorState, LoadingState, Pill, Stars, styles as ui } from './ui';
import type { TripDTO } from '../../types/api';
import type { PersonRef, TripParticipant } from '../../types/trust';

interface Props {
  trip: TripDTO;
  isDriver: boolean;
  isAccepted: boolean;
}

export const TripPeopleSection: React.FC<Props> = ({ trip, isDriver, isAccepted }) => {
  const participa = isDriver || isAccepted;
  const [people, setPeople] = useState<TripParticipant[] | null>(null);
  const [rating, setRating] = useState<{ user: PersonRef; role: 'driver' | 'passenger' } | null>(null);
  const [reporting, setReporting] = useState<{ user: PersonRef; role: 'driver' | 'passenger' } | null>(null);
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  // Solo quien participó puede pedir la lista; se vuelve a pedir si cambia el estado del viaje.
  const tripStatus = trip.status;
  const fetcher = useCallback(
    () => (participa ? getTripParticipants(trip.id) : Promise.resolve(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tripStatus fuerza recargar al finalizar
    [participa, trip.id, tripStatus],
  );
  const { loading, error, load: cargar } = useLoader(fetcher, (r) => setPeople(r ? r.participants : null));

  const tripRef = { origin: trip.origin.text, destination: trip.destination.text, departureAt: trip.departureAt };

  // Solicitud no aceptada: sin lista de participantes, pero se puede reportar al conductor.
  if (!participa) {
    if (!trip.userReservationStatus || isDriver) return null;
    const driver: PersonRef = { id: trip.driver.id, fullName: trip.driver.fullName, photoUrl: trip.driver.photoUrl ?? null };
    const yaReportado = reportedIds.includes(driver.id);
    return (
      <View style={s.wrap}>
        <Button
          label={yaReportado ? 'Conductor reportado' : 'Reportar al conductor'}
          icon="flag-outline" variant="danger" small disabled={yaReportado}
          onPress={() => setReporting({ user: driver, role: 'driver' })}
        />
        <ReportUserModal
          visible={!!reporting} tripId={trip.id} trip={tripRef} user={reporting?.user ?? null} role="driver"
          onClose={() => setReporting(null)} onReported={() => setReportedIds((l) => [...l, driver.id])}
        />
      </View>
    );
  }

  const finalizado = trip.status === 'finished';

  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <MaterialCommunityIcons name="account-group-outline" size={20} color={THEME.colors.primary} />
        <Text style={s.title}>{isDriver ? 'Tus pasajeros' : 'Tu conductor'}</Text>
      </View>
      {!finalizado && (
        <Text style={ui.small}>Podrás calificar cuando el viaje se finalice. Si algo sale mal, puedes reportarlo en cualquier momento.</Text>
      )}

      {loading && participa && !people ? <LoadingState label="Cargando participantes…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => cargar()} /> : null}
      {people && people.length === 0 ? <Text style={ui.muted}>Este viaje no tuvo pasajeros aceptados.</Text> : null}

      {people?.map((p) => {
        const reportado = p.alreadyReported || reportedIds.includes(p.user.id);
        return (
          <View key={p.user.id} style={s.person}>
            <View style={ui.row}>
              <DriverAvatar fullName={p.user.fullName} photoUrl={p.user.photoUrl} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={ui.label} numberOfLines={1}>{p.user.fullName}</Text>
                <Text style={ui.small} numberOfLines={1}>{p.role === 'driver' ? 'Conductor' : 'Pasajero'}{p.user.affiliation ? ` · ${p.user.affiliation}` : ''}</Text>
              </View>
              {p.myRating ? (
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Stars value={p.myRating.score} size={14} />
                  <Pill label="Calificado" tone="success" icon="check" />
                </View>
              ) : null}
            </View>
            <View style={s.actions}>
              {finalizado && p.canRate ? (
                <Button label="Calificar" icon="star-outline" small onPress={() => setRating({ user: p.user, role: p.role })} style={{ flex: 1 }} />
              ) : null}
              <Button
                label={reportado ? 'Reportado' : 'Reportar'} icon="flag-outline" variant="danger" small disabled={reportado}
                onPress={() => setReporting({ user: p.user, role: p.role })} style={{ flex: 1 }}
              />
            </View>
          </View>
        );
      })}

      <RateUserModal
        visible={!!rating} tripId={trip.id} user={rating?.user ?? null} role={rating?.role ?? 'driver'}
        onClose={() => setRating(null)}
        onRated={(r) => {
          setPeople((list) => list?.map((x) => (x.user.id === r.ratedUser.id ? { ...x, myRating: r, canRate: false } : x)) ?? list);
          setRating(null);
        }}
      />
      <ReportUserModal
        visible={!!reporting} tripId={trip.id} trip={tripRef} user={reporting?.user ?? null} role={reporting?.role ?? 'driver'}
        onClose={() => setReporting(null)}
        onReported={() => reporting && setReportedIds((l) => [...l, reporting.user.id])}
      />
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { backgroundColor: THEME.colors.surface, borderRadius: THEME.borderRadius.lg, padding: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: THEME.colors.border, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: THEME.colors.textPrimary },
  person: { borderTopWidth: 1, borderTopColor: THEME.colors.border, paddingTop: 10, gap: 10 },
  actions: { flexDirection: 'row', gap: 8 },
});
