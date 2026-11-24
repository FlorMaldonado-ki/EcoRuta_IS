/**
 * Ventana para calificar a otra persona del viaje (RF-27).
 *   1. Se muestra a quién se califica.
 *   2. Se eligen de 1 a 5 estrellas; entonces aparece el comentario (opcional).
 *   3. Se avisa que la puntuación es definitiva y se pide confirmar.
 *   4. "Ahora no" cierra sin calificar.
 * Solo se informa éxito cuando la API confirma (201).
 */
import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { DriverAvatar } from '../DriverAvatar';
import { createRating } from '../../services/trustService';
import { ApiError } from '../../services/apiClient';
import { errorMessage } from '../../services/tripService';
import { Button, Sheet, Stars, starLabel, styles as ui } from './ui';
import type { GivenRating, PersonRef } from '../../types/trust';

const MAX_COMENTARIO = 280;

interface RateUserModalProps {
  visible: boolean;
  tripId: string;
  user: PersonRef | null;
  /** Papel de la persona calificada en el viaje. */
  role: 'driver' | 'passenger';
  onClose: () => void;
  onRated: (rating: GivenRating) => void;
}

/** Cada vez que se abre (o cambia la persona) el formulario se monta de nuevo, limpio. */
export const RateUserModal: React.FC<RateUserModalProps> = (props) =>
  props.visible && props.user ? <RateUserForm key={props.user.id} {...props} user={props.user} /> : null;

const RateUserForm: React.FC<RateUserModalProps & { user: PersonRef }> = ({ visible, tripId, user, role, onClose, onRated }) => {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const papel = role === 'driver' ? 'conductor' : 'pasajero';

  const enviar = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await createRating({ tripId, ratedUserId: user.id, score, comment: comment.trim() || null });
      onRated(r);
    } catch (err) {
      setConfirming(false);
      // Si ya se había calificado (otro dispositivo), se avisa: la calificación previa es la que cuenta.
      setError(err instanceof ApiError && err.code === 'YA_CALIFICADO'
        ? 'Ya habías calificado a esta persona en este viaje. Esa calificación es la definitiva.'
        : errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const footer = confirming ? (
    <>
      <Button label="Revisar" variant="secondary" onPress={() => setConfirming(false)} disabled={sending} style={{ flex: 1 }} />
      <Button label="Sí, enviar" icon="send" onPress={enviar} loading={sending} style={{ flex: 1 }} />
    </>
  ) : (
    <>
      <Button label="Ahora no" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
      <Button label="Enviar calificación" icon="star-check" onPress={() => setConfirming(true)} disabled={score === 0} style={{ flex: 2 }} />
    </>
  );

  return (
    <Sheet visible={visible} title={`Califica a tu ${papel}`} icon="star-outline" onClose={onClose} closeDisabled={sending} footer={footer}>
      <View style={ui.row}>
        <DriverAvatar fullName={user.fullName} photoUrl={user.photoUrl} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={ui.label} numberOfLines={2}>{user.fullName}</Text>
          <Text style={ui.muted}>{user.affiliation ?? `Tu ${papel} en este viaje`}</Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 4 }}>
        <Stars value={score} size={36} onChange={confirming ? undefined : setScore} disabled={sending} />
        <Text style={[ui.label, { color: score ? THEME.colors.accentDark : THEME.colors.textMuted }]}>
          {score ? starLabel(score) : 'Toca las estrellas para calificar'}
        </Text>
      </View>

      {score > 0 && (
        <View>
          <Text style={ui.label}>Comentario <Text style={ui.small}>(opcional)</Text></Text>
          <TextInput
            style={[ui.textArea, { marginTop: 6 }]}
            value={comment}
            onChangeText={(t) => setComment(t.slice(0, MAX_COMENTARIO))}
            placeholder={`¿Algo que quieras contar sobre tu ${papel}?`}
            placeholderTextColor={THEME.colors.textMuted}
            multiline
            editable={!confirming && !sending}
            accessibilityLabel="Comentario opcional"
          />
          <Text style={[ui.small, { textAlign: 'right', marginTop: 4 }]}>{comment.length}/{MAX_COMENTARIO}</Text>
        </View>
      )}

      <View style={[ui.notice, confirming && { borderColor: THEME.colors.accent }]}>
        <MaterialCommunityIcons name="lock-outline" size={18} color={THEME.colors.accentDark} />
        <Text style={ui.noticeText}>
          {confirming
            ? `¿Enviar ${score} ${score === 1 ? 'estrella' : 'estrellas'}? Después no podrás cambiar ni borrar la puntuación.`
            : 'La puntuación es definitiva. El comentario sí podrás editarlo o borrarlo después (se muestra 30 días).'}
        </Text>
      </View>

      {error ? <Text style={ui.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </Sheet>
  );
};
