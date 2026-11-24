/**
 * Finalizar un viaje con confirmación y resumen del CO₂.
 * Lo usan Mis viajes › Conductor y el detalle del viaje.
 */
import { useState } from 'react';
import { canFinishTrip, errorMessage, finishTrip, type FinishTripResult } from '../services/tripService';
import { confirmAction, notify } from '../utils/notify';
import { formatKg, formatKm } from '../utils/format';
import { useImpact } from './useImpact';
import { useNotifications } from './useNotifications';
import type { TripDTO, UserDTO } from '../types/api';

const horaLocal = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

export function useFinishTrip(currentUser: UserDTO, onFinished?: (result: FinishTripResult) => void) {
  const { invalidate } = useImpact();
  const { showAlert } = useNotifications();
  const [finishingId, setFinishingId] = useState<string | null>(null);

  const run = async (trip: TripDTO) => {
    setFinishingId(trip.id);
    try {
      const result = await finishTrip(trip.id, currentUser);
      invalidate(); // el inicio y "Mi impacto" ya muestran el valor nuevo
      const { impact } = result;
      if (impact) {
        const pasajeros = `${impact.passengers} pasajero${impact.passengers === 1 ? '' : 's'}`;
        notify(
          '¡Viaje finalizado!',
          `Este viaje ahorró ${formatKg(impact.co2Kg)} de CO₂ (${formatKm(impact.distanceKm)} × ${pasajeros}).\n\n¡Gracias por compartir tu trayecto con la comunidad!`,
        );
        showAlert({ tone: 'success', title: 'Viaje finalizado', message: `Ahorraron ${formatKg(impact.co2Kg)} de CO₂.`, icon: 'leaf' });
      } else {
        notify('Viaje finalizado', 'El viaje quedó en tu historial. Como no tuvo pasajeros aceptados, no se registró CO₂ ahorrado.');
      }
      onFinished?.(result);
      return result;
    } catch (err) {
      showAlert({ tone: 'warning', title: 'No se pudo finalizar el viaje', message: errorMessage(err) });
      return null;
    } finally {
      setFinishingId(null);
    }
  };

  /** Pide confirmación y finaliza. Antes de la hora de salida solo explica por qué no se puede. */
  const requestFinish = (trip: TripDTO) => {
    if (!canFinishTrip(trip)) {
      notify('Aún no puedes finalizar', `Podrás finalizar este viaje a partir de la hora de salida (${horaLocal(trip.departureAt)}).`);
      return;
    }
    const aceptados = trip.acceptedPassengers ?? 0;
    confirmAction(
      '¿Finalizar viaje?',
      aceptados > 0
        ? `Confirma que el viaje ya terminó. Se registrará el CO₂ ahorrado con ${aceptados} pasajero${aceptados === 1 ? '' : 's'}.`
        : 'Confirma que el viaje ya terminó. Como no tuvo pasajeros aceptados, no se registrará CO₂ ahorrado.',
      'Finalizar viaje',
      () => { run(trip); },
    );
  };

  return { requestFinish, finishingId };
}
