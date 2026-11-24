/**
 * Recordatorio único para calificar (RF-27).
 * Calificar no es obligatorio: después de un viaje finalizado se muestra UNA vez,
 * de forma discreta y sin bloquear la app. En cuanto aparece se avisa a la API
 * (POST /api/calificaciones/recordatorios/:viajeId) para que no vuelva a mostrarse
 * en ningún dispositivo, califique la persona o no.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { getRatingReminders, markReminderShown } from '../../services/trustService';
import { RateUserModal } from './RateUserModal';
import { Button } from './ui';
import type { RatingReminder } from '../../types/trust';

export const RatingReminderBanner: React.FC = () => {
  const [reminder, setReminder] = useState<RatingReminder | null>(null);
  const [visible, setVisible] = useState(false);
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const [ratedCount, setRatedCount] = useState(0);
  const marcado = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getRatingReminders()
      .then(({ items }) => {
        if (vivo && items[0]) {
          setReminder(items[0]);
          setVisible(true);
        }
      })
      .catch(() => { /* el recordatorio es opcional: si falla, simplemente no se muestra */ });
    return () => { vivo = false; };
  }, []);

  // Se muestra una sola vez: al aparecer queda registrado en la API.
  useEffect(() => {
    if (visible && reminder && marcado.current !== reminder.tripId) {
      marcado.current = reminder.tripId;
      markReminderShown(reminder.tripId).catch(() => { /* si falla, se intentará la próxima vez que aparezca */ });
    }
  }, [visible, reminder]);

  if (!reminder || !visible) return null;

  const persona = queueIndex !== null ? reminder.toRate[queueIndex] ?? null : null;
  const nombres = reminder.toRate.map((u) => u.fullName.split(' ')[0]).join(', ');
  const todos = ratedCount >= reminder.toRate.length;

  const siguiente = () => {
    const i = (queueIndex ?? -1) + 1;
    setQueueIndex(i < reminder.toRate.length ? i : null);
  };

  return (
    <View style={s.card} accessibilityRole="summary">
      <View style={s.iconBox}>
        <MaterialCommunityIcons name={todos ? 'check-decagram' : 'star-face'} size={24} color={THEME.colors.accentDark} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={s.title}>{todos ? '¡Gracias por calificar!' : '¿Cómo te fue en tu último viaje?'}</Text>
        {!todos && (
          <Text style={s.text}>
            {reminder.trip.origin} → {reminder.trip.destination}. Califica a {nombres}: ayuda a que la comunidad viaje con confianza. Es opcional.
          </Text>
        )}
        {!todos && <Button label="Calificar ahora" icon="star-outline" small onPress={siguiente} style={{ alignSelf: 'flex-start' }} />}
      </View>
      <TouchableOpacity onPress={() => setVisible(false)} style={s.close} accessibilityRole="button" accessibilityLabel="Descartar recordatorio">
        <MaterialCommunityIcons name="close" size={20} color={THEME.colors.textSecondary} />
      </TouchableOpacity>

      <RateUserModal
        visible={!!persona}
        tripId={reminder.tripId}
        user={persona}
        role={reminder.myRole === 'driver' ? 'passenger' : 'driver'}
        onClose={() => setQueueIndex(null)}
        onRated={() => {
          setRatedCount((n) => n + 1);
          siguiente();
        }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#FDF8E8', borderWidth: 1, borderColor: THEME.colors.accentLight, borderRadius: THEME.borderRadius.lg, padding: 14, marginBottom: 16, alignItems: 'flex-start' },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: THEME.colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: THEME.colors.textPrimary },
  text: { fontSize: 13, color: THEME.colors.textSecondary, lineHeight: 19 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
});
