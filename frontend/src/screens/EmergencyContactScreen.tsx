/**
 * Contacto de emergencia (RF-31, ampliación de alcance). Para todos los usuarios.
 * Registrar, consultar y editar. Teléfono de México: 10 dígitos con la LADA
 * incluida (no se agrega una LADA aparte). Sin llamadas automáticas ni ubicación.
 */
import React, { useCallback, useState } from 'react';
import { useLoader } from '../hooks/useLoader';
import { View, Text, TextInput, Linking, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { SelectModalField } from '../components/SelectModalField';
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, fechaHora, styles as ui } from '../components/trust/ui';
import { getEmergencyContact, saveEmergencyContact } from '../services/trustService';
import { ApiError } from '../services/apiClient';
import { errorMessage } from '../services/tripService';
import type { EmergencyContact, Relationship } from '../types/trust';

const PARENTESCOS: { key: Relationship; label: string }[] = [
  { key: 'madre', label: 'Madre' }, { key: 'padre', label: 'Padre' },
  { key: 'hermano', label: 'Hermano' }, { key: 'hermana', label: 'Hermana' },
  { key: 'hijo', label: 'Hijo' }, { key: 'hija', label: 'Hija' },
  { key: 'pareja', label: 'Pareja' }, { key: 'abuelo', label: 'Abuelo' }, { key: 'abuela', label: 'Abuela' },
  { key: 'familiar', label: 'Familiar' }, { key: 'amigo', label: 'Amigo' }, { key: 'amiga', label: 'Amiga' },
  { key: 'otro', label: 'Otro' },
];

/**
 * Normaliza un número de México: quita espacios, guiones, puntos y paréntesis, y el +52 si lo trae.
 * @returns los 10 dígitos o null si no es válido
 */
export function normalizarTelefonoMx(texto: string): string | null {
  const t = texto.trim();
  if (!t || !/^[+\d\s\-().]+$/.test(t)) return null;
  let d = t.replace(/\D/g, '');
  if (t.startsWith('+')) {
    if (!d.startsWith('52')) return null;
    d = d.slice(2);
  } else if (d.length === 12 && d.startsWith('52')) {
    d = d.slice(2);
  }
  return /^\d{10}$/.test(d) ? d : null;
}

const formatoTelefono = (d: string) => `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;

type Campo = 'name' | 'phone' | 'relationship' | 'relationshipOther';

interface Props {
  onBack: () => void;
}

export const EmergencyContactScreen: React.FC<Props> = ({ onBack }) => {
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [other, setOther] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Campo, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetcher = useCallback(() => getEmergencyContact(), []);
  const { loading, error: loadError, load: cargar } = useLoader(fetcher, (r) => setContact(r.contact));

  const abrirFormulario = () => {
    setName(contact?.name ?? '');
    setPhone(contact ? formatoTelefono(contact.phone) : '');
    setRelationship(contact?.relationship ?? null);
    setOther(contact?.relationshipOther ?? '');
    setErrors({});
    setSaveError(null);
    setSaved(false);
    setEditing(true);
  };

  const validar = () => {
    const e: Partial<Record<Campo, string>> = {};
    const n = name.trim().replace(/\s+/g, ' ');
    if (n.length < 3) e.name = 'Escribe el nombre de tu contacto.';
    else if (/\d/.test(n)) e.name = 'El nombre no debe llevar números.';
    if (!phone.trim()) e.phone = 'Escribe el número de teléfono.';
    else if (/[^\d\s\-().+]/.test(phone)) e.phone = 'Usa solo números (puedes separarlos con espacios o guiones).';
    else if (!normalizarTelefonoMx(phone)) e.phone = 'Debe tener 10 dígitos, incluida la LADA (p. ej. 443 123 4567).';
    if (!relationship) e.relationship = 'Selecciona el parentesco.';
    if (relationship === 'otro' && !other.trim()) e.relationshipOther = 'Especifica el parentesco.';
    return e;
  };

  const guardar = async () => {
    const e = validar();
    setErrors(e);
    if (Object.keys(e).length || !relationship) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveEmergencyContact({
        name: name.trim().replace(/\s+/g, ' '),
        phone: normalizarTelefonoMx(phone) as string,
        relationship,
        ...(relationship === 'otro' ? { relationshipOther: other.trim() } : {}),
      });
      setContact(r.contact);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields as Partial<Record<Campo, string>>);
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const etiquetaParentesco = PARENTESCOS.find((p) => p.key === relationship)?.label ?? '';
  const digitos = phone.replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '').length;

  return (
    <Screen
      title="Contacto de emergencia"
      subtitle="Una persona de confianza a quien avisar si algo pasa durante un viaje. Solo tú puedes verla."
      onBack={onBack}
      backLabel="Volver al inicio"
    >
      {loading ? <LoadingState /> : null}
      {loadError ? <ErrorState message={loadError} onRetry={cargar} /> : null}

      {!loading && !loadError && !editing && !contact ? (
        <EmptyState
          icon="account-heart-outline"
          title="No tienes un contacto de emergencia"
          message="Agrégalo para tenerlo a la mano cuando lo necesites."
          action={<Button label="Agregar contacto" icon="plus" onPress={abrirFormulario} />}
        />
      ) : null}

      {!loading && !loadError && !editing && contact ? (
        <Card>
          {saved ? (
            <View style={[ui.row, { marginBottom: 10 }]} accessibilityRole="alert">
              <MaterialCommunityIcons name="check-circle" size={18} color={THEME.colors.success} />
              <Text style={[ui.label, { color: THEME.colors.success }]}>Contacto guardado</Text>
            </View>
          ) : null}
          <View style={ui.row}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: THEME.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="account-heart" size={26} color={THEME.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ui.label, { fontSize: 16 }]}>{contact.name}</Text>
              <Text style={ui.muted}>{contact.relationshipLabel}</Text>
            </View>
          </View>
          <View style={[ui.row, { marginTop: 12 }]}>
            <MaterialCommunityIcons name="phone" size={18} color={THEME.colors.textSecondary} />
            <Text style={[ui.label, { fontSize: 16, letterSpacing: 0.5 }]}>{formatoTelefono(contact.phone)}</Text>
          </View>
          <Text style={[ui.small, { marginTop: 8 }]}>Actualizado el {fechaHora(contact.updatedAt)}</Text>
          <View style={[ui.row, { marginTop: 14, flexWrap: 'wrap' }]}>
            <Button label="Editar" icon="pencil-outline" variant="secondary" small onPress={abrirFormulario} />
            {Platform.OS !== 'web' ? (
              <Button label="Llamar" icon="phone-outline" variant="ghost" small onPress={() => Linking.openURL(`tel:${contact.phone}`)} />
            ) : null}
          </View>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <View style={{ gap: 12 }}>
            <View>
              <Text style={ui.label}>Nombre del contacto <Text style={{ color: THEME.colors.error }}>*</Text></Text>
              <TextInput
                style={[ui.input, { marginTop: 6 }, errors.name ? ui.textAreaError : null]}
                value={name}
                onChangeText={(t) => { setName(t.slice(0, 120)); setErrors((e) => ({ ...e, name: undefined })); }}
                placeholder="Nombre y apellidos"
                placeholderTextColor={THEME.colors.textMuted}
                autoCapitalize="words"
                accessibilityLabel="Nombre del contacto"
              />
              {errors.name ? <Text style={ui.fieldError}>{errors.name}</Text> : null}
            </View>

            <View>
              <Text style={ui.label}>Teléfono <Text style={{ color: THEME.colors.error }}>*</Text></Text>
              <TextInput
                style={[ui.input, { marginTop: 6 }, errors.phone ? ui.textAreaError : null]}
                value={phone}
                onChangeText={(t) => { setPhone(t.slice(0, 20)); setErrors((e) => ({ ...e, phone: undefined })); }}
                placeholder="443 123 4567"
                placeholderTextColor={THEME.colors.textMuted}
                keyboardType="phone-pad"
                accessibilityLabel="Teléfono del contacto, 10 dígitos"
              />
              {errors.phone ? (
                <Text style={ui.fieldError}>{errors.phone}</Text>
              ) : (
                <Text style={[ui.small, { marginTop: 4 }]}>10 dígitos con la LADA incluida · llevas {digitos}</Text>
              )}
            </View>

            <SelectModalField
              label="Parentesco"
              value={etiquetaParentesco}
              placeholder="Selecciona…"
              options={PARENTESCOS.map((p) => p.label)}
              onSelect={(label) => {
                setRelationship(PARENTESCOS.find((p) => p.label === label)?.key ?? null);
                setErrors((e) => ({ ...e, relationship: undefined }));
              }}
              error={errors.relationship}
              iconName="account-group-outline"
            />

            {relationship === 'otro' ? (
              <View>
                <Text style={ui.label}>Especifica el parentesco <Text style={{ color: THEME.colors.error }}>*</Text></Text>
                <TextInput
                  style={[ui.input, { marginTop: 6 }, errors.relationshipOther ? ui.textAreaError : null]}
                  value={other}
                  onChangeText={(t) => { setOther(t.slice(0, 60)); setErrors((e) => ({ ...e, relationshipOther: undefined })); }}
                  placeholder="p. ej. Tutor, Tía, Compañero de casa"
                  placeholderTextColor={THEME.colors.textMuted}
                  accessibilityLabel="Especifica el parentesco"
                />
                {errors.relationshipOther ? <Text style={ui.fieldError}>{errors.relationshipOther}</Text> : null}
              </View>
            ) : null}

            {saveError ? <Text style={ui.fieldError} accessibilityRole="alert">{saveError}</Text> : null}

            <View style={[ui.row, { flexWrap: 'wrap' }]}>
              <Button label="Cancelar" variant="ghost" onPress={() => setEditing(false)} disabled={saving} />
              <Button label="Guardar contacto" icon="content-save-outline" onPress={guardar} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
};
