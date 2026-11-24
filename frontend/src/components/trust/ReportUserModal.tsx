/**
 * Ventana para reportar a otra persona de un viaje (RF-28).
 * Todos los campos son obligatorios; "Otro" pide especificar el motivo.
 * Antes de enviar se pide confirmación; si la API falla, lo escrito se conserva.
 * Solo se dice "recibido" cuando la API responde 201.
 */
import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { DriverAvatar } from '../DriverAvatar';
import { SelectModalField } from '../SelectModalField';
import { createReport } from '../../services/trustService';
import { ApiError } from '../../services/apiClient';
import { errorMessage } from '../../services/tripService';
import { Button, Sheet, fechaHora, styles as ui } from './ui';
import type { PersonRef, ReportReason, TripRef } from '../../types/trust';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'conducta_inapropiada', label: 'Comportamiento inapropiado' },
  { key: 'incumplimiento_acuerdos', label: 'Incumplimiento de acuerdos del viaje' },
  { key: 'informacion_falsa', label: 'Información falsa o engañosa' },
  { key: 'seguridad', label: 'Problemas de seguridad' },
  { key: 'acoso', label: 'Acoso o intimidación' },
  { key: 'incumplimiento_normas', label: 'Incumplimiento de normas' },
  { key: 'otro', label: 'Otro' },
];

const MIN_DESC = 10;
const MAX_DESC = 1000;
const MAX_OTRO = 100;

interface ReportUserModalProps {
  visible: boolean;
  tripId: string;
  trip?: TripRef | null;
  user: PersonRef | null;
  role: 'driver' | 'passenger';
  onClose: () => void;
  onReported?: () => void;
}

type Errores = Partial<Record<'reason' | 'reasonOther' | 'description', string>>;

/** Se monta limpio cada vez que se abre para una persona. */
export const ReportUserModal: React.FC<ReportUserModalProps> = (props) =>
  props.visible && props.user ? <ReportUserForm key={props.user.id} {...props} user={props.user} /> : null;

const ReportUserForm: React.FC<ReportUserModalProps & { user: PersonRef }> = ({ visible, tripId, trip, user, role, onClose, onReported }) => {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [reasonOther, setReasonOther] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Errores>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const papel = role === 'driver' ? 'conductor' : 'pasajero';

  const validar = (): Errores => {
    const e: Errores = {};
    if (!reason) e.reason = 'Selecciona un motivo.';
    if (reason === 'otro') {
      if (!reasonOther.trim()) e.reasonOther = 'Especifica el motivo.';
      else if (reasonOther.trim().length > MAX_OTRO) e.reasonOther = `Máximo ${MAX_OTRO} caracteres.`;
    }
    const d = description.trim();
    if (!d) e.description = 'Describe lo que pasó.';
    else if (d.length < MIN_DESC) e.description = `Escribe al menos ${MIN_DESC} caracteres.`;
    return e;
  };

  const pedirConfirmacion = () => {
    const e = validar();
    setErrors(e);
    if (Object.keys(e).length === 0) setConfirming(true);
  };

  const enviar = async () => {
    if (!reason) return;
    setSending(true);
    setApiError(null);
    try {
      const r = await createReport({
        reportedUserId: user.id,
        tripId,
        reason,
        ...(reason === 'otro' ? { reasonOther: reasonOther.trim() } : {}),
        description: description.trim(),
      });
      setDoneMessage(r.message);
      onReported?.();
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.fields) setErrors(err.fields as Errores);
      setApiError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (doneMessage) {
    return (
      <Sheet visible={visible} title="Reporte recibido" icon="shield-check-outline" onClose={onClose}
        footer={<Button label="Entendido" onPress={onClose} style={{ flex: 1 }} />}>
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <MaterialCommunityIcons name="check-decagram" size={48} color={THEME.colors.success} />
          <Text style={[ui.muted, { textAlign: 'center', fontSize: 15 }]}>{doneMessage}</Text>
        </View>
      </Sheet>
    );
  }

  const etiqueta = REPORT_REASONS.find((r) => r.key === reason)?.label ?? '';
  const footer = confirming ? (
    <>
      <Button label="Revisar" variant="secondary" onPress={() => setConfirming(false)} disabled={sending} style={{ flex: 1 }} />
      <Button label="Sí, enviar reporte" icon="send" onPress={enviar} loading={sending} style={{ flex: 1.4 }} />
    </>
  ) : (
    <>
      <Button label="Cancelar" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
      <Button label="Enviar reporte" icon="flag-outline" onPress={pedirConfirmacion} style={{ flex: 1.4 }} />
    </>
  );

  return (
    <Sheet visible={visible} title={`Reportar ${papel}`} icon="flag-outline" onClose={onClose} closeDisabled={sending} footer={footer}>
      <View style={ui.row}>
        <DriverAvatar fullName={user.fullName} photoUrl={user.photoUrl} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={ui.label} numberOfLines={2}>{user.fullName}</Text>
          <Text style={ui.muted}>{papel[0].toUpperCase() + papel.slice(1)} de este viaje</Text>
        </View>
      </View>

      {trip ? (
        <View style={[ui.row, { backgroundColor: THEME.colors.surfaceAlt, padding: 10, borderRadius: THEME.borderRadius.md }]}>
          <MaterialCommunityIcons name="map-marker-path" size={18} color={THEME.colors.textSecondary} />
          <Text style={[ui.muted, { flex: 1 }]} numberOfLines={2}>
            {trip.origin} → {trip.destination} · {fechaHora(trip.departureAt)}
          </Text>
        </View>
      ) : null}

      {confirming ? (
        <View style={[ui.notice, { borderColor: THEME.colors.accent }]}>
          <MaterialCommunityIcons name="help-circle-outline" size={18} color={THEME.colors.accentDark} />
          <Text style={ui.noticeText}>
            ¿Enviar el reporte por «{reason === 'otro' ? reasonOther.trim() : etiqueta}»? El equipo de administración lo revisará de forma confidencial; {user.fullName.split(' ')[0]} no verá quién lo envió.
          </Text>
        </View>
      ) : (
        <>
          <SelectModalField
            label="Motivo"
            value={etiqueta}
            placeholder="Selecciona el motivo…"
            options={REPORT_REASONS.map((r) => r.label)}
            onSelect={(label) => {
              setReason(REPORT_REASONS.find((r) => r.label === label)?.key ?? null);
              setErrors((e) => ({ ...e, reason: undefined }));
            }}
            error={errors.reason}
            iconName="flag-variant-outline"
          />

          {reason === 'otro' && (
            <View>
              <Text style={ui.label}>Especifica el motivo <Text style={{ color: THEME.colors.error }}>*</Text></Text>
              <TextInput
                style={[ui.input, { marginTop: 6 }, errors.reasonOther ? ui.textAreaError : null]}
                value={reasonOther}
                onChangeText={(t) => { setReasonOther(t.slice(0, MAX_OTRO)); setErrors((e) => ({ ...e, reasonOther: undefined })); }}
                placeholder="Escribe el motivo"
                placeholderTextColor={THEME.colors.textMuted}
                accessibilityLabel="Especifica el motivo"
              />
              {errors.reasonOther ? <Text style={ui.fieldError}>{errors.reasonOther}</Text> : null}
            </View>
          )}

          <View>
            <Text style={ui.label}>Descripción <Text style={{ color: THEME.colors.error }}>*</Text></Text>
            <TextInput
              style={[ui.textArea, { marginTop: 6, minHeight: 120 }, errors.description ? ui.textAreaError : null]}
              value={description}
              onChangeText={(t) => { setDescription(t.slice(0, MAX_DESC)); setErrors((e) => ({ ...e, description: undefined })); }}
              placeholder="Cuenta qué pasó, cuándo y cualquier detalle que ayude a revisarlo."
              placeholderTextColor={THEME.colors.textMuted}
              multiline
              accessibilityLabel="Descripción del reporte"
            />
            <View style={[ui.row, { justifyContent: 'space-between', marginTop: 4 }]}>
              {errors.description ? <Text style={ui.fieldError}>{errors.description}</Text> : <Text style={ui.small}>Mínimo {MIN_DESC} caracteres</Text>}
              <Text style={ui.small}>{description.length}/{MAX_DESC}</Text>
            </View>
          </View>
        </>
      )}

      {apiError ? <Text style={ui.fieldError} accessibilityRole="alert">{apiError} Tu texto se conservó; puedes intentarlo de nuevo.</Text> : null}
    </Sheet>
  );
};
