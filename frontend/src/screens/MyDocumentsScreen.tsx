/**
 * "Mis documentos": estado de la revisión del documento institucional.
 * Si el administrador lo rechazó, se ve su comentario y se puede enviar uno
 * nuevo, que queda "Pendiente de revisión" solo cuando la API lo confirma.
 * El documento rechazado se conserva en el historial (no se vuelve "aceptado").
 */
import React, { useCallback, useState } from 'react';
import { useLoader } from '../hooks/useLoader';
import { View, Text, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { DocumentPickerField } from '../components/DocumentPickerField';
import { Button, Card, EmptyState, ErrorState, LoadingState, Pill, Screen, fechaHora, styles as ui, type PillTone, type IconName } from '../components/trust/ui';
import { getMyDocuments, resubmitDocument } from '../services/trustService';
import { errorMessage } from '../services/tripService';
import type { AttachedFile } from '../types/registration';
import type { DocumentStatus, MyDocumentsDTO, UserDocument } from '../types/trust';

export const DOC_STATUS: Record<DocumentStatus, { label: string; tone: PillTone; icon: IconName }> = {
  pending: { label: 'Pendiente de revisión', tone: 'warning', icon: 'clock-outline' },
  approved: { label: 'Aceptado', tone: 'success', icon: 'check-circle-outline' },
  rejected: { label: 'Rechazado', tone: 'error', icon: 'close-circle-outline' },
};

/** Etiquetas de los tipos que admite el sistema; un tipo nuevo se muestra con la etiqueta de la API. */
export const DOC_TYPE_ICON: Record<string, IconName> = {
  reticula_academica: 'school-outline',
  carga_horaria: 'calendar-clock',
  tarjeta_circulacion: 'card-account-details-outline',
};

const tamano = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

interface Props {
  onBack: () => void;
}

export const MyDocumentsScreen: React.FC<Props> = ({ onBack }) => {
  const [data, setData] = useState<MyDocumentsDTO | null>(null);
  const [file, setFile] = useState<AttachedFile | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const fetcher = useCallback(() => getMyDocuments(), []);
  const { loading, error, load: cargar } = useLoader(fetcher, setData);

  const enviar = async () => {
    if (!file) { setFileError('Selecciona el nuevo documento (PDF, PNG o JPG).'); return; }
    setUploading(true);
    setFileError(undefined);
    try {
      await resubmitDocument(file);
      setFile(null);
      setUploaded(true);
      await cargar();
    } catch (err) {
      setFileError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const actual = data?.items[0] ?? null;
  const historial = data?.items.slice(1) ?? [];

  const tarjeta = (d: UserDocument, destacado = false) => {
    const st = DOC_STATUS[d.status];
    return (
      <Card key={d.id} style={destacado ? { borderColor: THEME.colors.primary, borderWidth: 1.5 } : undefined}>
        <View style={ui.row}>
          <MaterialCommunityIcons name={DOC_TYPE_ICON[d.type] ?? 'file-document-outline'} size={28} color={THEME.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={ui.label}>{d.typeLabel}</Text>
            <Text style={ui.small} numberOfLines={1}>{d.fileName} · {tamano(d.sizeBytes)}</Text>
            <Text style={ui.small}>Enviado el {fechaHora(d.uploadedAt)}</Text>
          </View>
        </View>
        <View style={{ marginTop: 10 }}><Pill label={st.label} tone={st.tone} icon={st.icon} /></View>
        {d.status === 'rejected' && d.rejectionReason ? (
          <View style={[ui.notice, { marginTop: 10, backgroundColor: THEME.colors.errorBg, borderColor: THEME.colors.errorBorder }]}>
            <MaterialCommunityIcons name="message-alert-outline" size={18} color={THEME.colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[ui.label, { color: THEME.colors.error }]}>Comentario del administrador</Text>
              <Text style={ui.noticeText}>{d.rejectionReason}</Text>
              <Text style={ui.small}>Revisado el {fechaHora(d.reviewedAt)}</Text>
            </View>
          </View>
        ) : null}
        {d.viewUrl ? (
          <Button label="Ver documento" icon="eye-outline" variant="secondary" small style={{ alignSelf: 'flex-start', marginTop: 10 }}
            onPress={() => Linking.openURL(d.viewUrl as string)} />
        ) : null}
      </Card>
    );
  };

  return (
    <Screen
      title="Mis documentos"
      subtitle="El administrador revisa tu documento institucional. Aquí ves el resultado."
      onBack={onBack}
      backLabel="Volver al inicio"
      refreshing={loading}
      onRefresh={cargar}
    >
      {loading && !data ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={cargar} /> : null}

      {uploaded ? (
        <Card style={{ backgroundColor: THEME.colors.successBg, borderColor: THEME.colors.successBorder }}>
          <View style={ui.row} accessibilityRole="alert">
            <MaterialCommunityIcons name="check-decagram" size={22} color={THEME.colors.success} />
            <Text style={[ui.noticeText, { color: THEME.colors.success, fontWeight: '700' }]}>
              Recibimos tu nuevo documento. Quedó pendiente de revisión.
            </Text>
          </View>
        </Card>
      ) : null}

      {data && !actual ? (
        <EmptyState icon="file-document-outline" title="No tienes documentos registrados" message="Puedes enviar tu documento institucional para que el administrador lo revise." />
      ) : null}

      {actual ? tarjeta(actual, true) : null}

      {data?.canUpload ? (
        <Card>
          <Text style={[ui.label, { marginBottom: 8 }]}>
            {actual?.status === 'rejected' ? 'Reemplaza tu documento' : 'Envía tu documento'}
          </Text>
          <DocumentPickerField
            label={data.requiredType === 'carga_horaria' ? 'Carga horaria u horario del semestre' : 'Retícula académica vigente'}
            sublabel="PDF, PNG o JPG · máximo 10 MB"
            instructions="Asegúrate de que se lea completo y corresponda al semestre actual."
            file={file}
            onFileSelect={(f) => { setFile(f); setFileError(undefined); }}
            error={fileError}
          />
          <Button label="Enviar para revisión" icon="upload" onPress={enviar} loading={uploading} disabled={!file} style={{ marginTop: 8 }} />
        </Card>
      ) : null}

      {historial.length ? (
        <>
          <Text style={[ui.label, { marginTop: 8, marginBottom: 8 }]}>Historial</Text>
          {historial.map((d) => tarjeta(d))}
        </>
      ) : null}
    </Screen>
  );
};
