/**
 * Revisión de documentos (administrador).
 * Filtros combinables: estado, tipo, usuario (nombre o correo) y fecha de subida.
 * Ver / descargar con la URL temporal que entrega la API. Aceptar pide confirmación;
 * rechazar pide un comentario que el usuario verá en "Mis documentos".
 */
import React, { useCallback, useState } from 'react';
import { useLoader } from '../../hooks/useLoader';
import { View, Text, TextInput, TouchableOpacity, Image, Linking, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { DriverAvatar } from '../../components/DriverAvatar';
import { Button, Card, Chips, EmptyState, ErrorState, LoadingState, Pill, Screen, Sheet, fechaHora, styles as ui } from '../../components/trust/ui';
import { DOC_STATUS, DOC_TYPE_ICON } from '../MyDocumentsScreen';
import { getAdminDocuments, reviewDocument } from '../../services/adminService';
import { errorMessage } from '../../services/tripService';
import { confirmAction } from '../../utils/notify';
import type { UserDocument } from '../../types/trust';

type StatusKey = 'pending' | 'approved' | 'rejected' | 'all';
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export const AdminDocumentsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [status, setStatus] = useState<StatusKey>('pending');
  const [type, setType] = useState<string>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [applied, setApplied] = useState({ q: '', from: '', to: '' });
  const [types, setTypes] = useState<{ key: string; label: string }[]>([]);
  const [items, setItems] = useState<UserDocument[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserDocument | null>(null);

  const fetcher = useCallback((p: number) => getAdminDocuments({
    status: status === 'all' ? undefined : status,
    type: type === 'all' ? undefined : type,
    q: applied.q || undefined,
    from: applied.from || undefined,
    to: applied.to || undefined,
    order,
    page: p,
  }), [status, type, applied, order]);
  // Al cambiar un filtro cambia `fetcher` y se vuelve a pedir (quien cambia el filtro enciende el aviso de carga).
  const { loading, setLoading, error, load: cargar } = useLoader(fetcher, (r, p) => {
    setTypes(r.types);
    setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items]));
    setHasMore(r.hasMore);
    setPage(p);
  });

  const aplicarBusqueda = () => {
    for (const v of [from, to]) {
      if (v && !FECHA_RE.test(v)) { setDateError('Usa el formato AAAA-MM-DD (p. ej. 2026-11-24).'); return; }
    }
    if (from && to && from > to) { setDateError('La fecha "desde" debe ser anterior a "hasta".'); return; }
    setDateError(null);
    setLoading(true);
    setApplied({ q: q.trim(), from, to });
  };

  const limpiar = () => {
    setStatus('pending'); setType('all'); setQ(''); setFrom(''); setTo(''); setOrder('desc');
    setDateError(null); setLoading(true); setApplied({ q: '', from: '', to: '' });
  };

  const actualizarEnLista = (d: UserDocument) => {
    setItems((l) => (status === 'all' || d.status === status ? l.map((x) => (x.id === d.id ? d : x)) : l.filter((x) => x.id !== d.id)));
    setSelected(d);
  };

  return (
    <Screen title="Revisión de documentos" onBack={onBack} backLabel="Volver al panel" headerSubtitle="Administración">
      <Text style={[ui.label, { marginBottom: 6 }]}>Estado</Text>
      <Chips<StatusKey>
        options={[
          { key: 'pending', label: 'Pendientes', icon: 'clock-outline' },
          { key: 'approved', label: 'Aceptados', icon: 'check-circle-outline' },
          { key: 'rejected', label: 'Rechazados', icon: 'close-circle-outline' },
          { key: 'all', label: 'Todos' },
        ]}
        value={status}
        onChange={(k) => { setLoading(true); setStatus(k); }}
      />
      <Text style={[ui.label, { marginTop: 12, marginBottom: 6 }]}>Tipo de documento</Text>
      <Chips<string>
        options={[{ key: 'all', label: 'Todos' }, ...types.map((t) => ({ key: t.key, label: t.label, icon: DOC_TYPE_ICON[t.key] }))]}
        value={type}
        onChange={(k) => { setLoading(true); setType(k); }}
      />

      <Card style={{ marginTop: 12 }}>
        <Text style={ui.label}>Usuario</Text>
        <TextInput
          style={[ui.input, { marginTop: 6 }]}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={aplicarBusqueda}
          placeholder="Nombre o correo del propietario"
          placeholderTextColor={THEME.colors.textMuted}
          returnKeyType="search"
          accessibilityLabel="Buscar por nombre o correo"
        />
        <View style={[ui.row, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={ui.small}>Subido desde</Text>
            <TextInput style={[ui.input, { marginTop: 4 }]} value={from} onChangeText={setFrom} placeholder="AAAA-MM-DD"
              placeholderTextColor={THEME.colors.textMuted} accessibilityLabel="Fecha desde" maxLength={10} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ui.small}>hasta</Text>
            <TextInput style={[ui.input, { marginTop: 4 }]} value={to} onChangeText={setTo} placeholder="AAAA-MM-DD"
              placeholderTextColor={THEME.colors.textMuted} accessibilityLabel="Fecha hasta" maxLength={10} />
          </View>
        </View>
        {dateError ? <Text style={ui.fieldError}>{dateError}</Text> : null}
        <View style={[ui.row, { marginTop: 10, flexWrap: 'wrap' }]}>
          <Button label="Buscar" icon="magnify" small onPress={aplicarBusqueda} />
          <Button label={order === 'desc' ? 'Más recientes' : 'Más antiguos'} icon="swap-vertical" variant="secondary" small
            onPress={() => { setLoading(true); setOrder((o) => (o === 'desc' ? 'asc' : 'desc')); }} />
          <Button label="Limpiar filtros" icon="filter-remove-outline" variant="ghost" small onPress={limpiar} />
        </View>
      </Card>

      {error ? <ErrorState message={error} onRetry={() => cargar(1)} /> : null}
      {loading && items.length === 0 && !error ? <LoadingState /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState icon="file-search-outline" title="No hay documentos con estos filtros" />
      ) : null}

      {items.map((d) => {
        const st = DOC_STATUS[d.status];
        return (
          <TouchableOpacity key={d.id} onPress={() => setSelected(d)} activeOpacity={0.85} accessibilityRole="button"
            accessibilityLabel={`${d.typeLabel} de ${d.owner?.fullName}, ${st.label}`}>
            <Card>
              <View style={ui.row}>
                <DriverAvatar fullName={d.owner?.fullName} photoUrl={d.owner?.photoUrl} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.label} numberOfLines={1}>{d.owner?.fullName}</Text>
                  <Text style={ui.small} numberOfLines={1}>{d.owner?.email}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={THEME.colors.textMuted} />
              </View>
              <View style={[ui.row, { marginTop: 10, flexWrap: 'wrap' }]}>
                <Pill label={d.typeLabel} tone="primary" icon={DOC_TYPE_ICON[d.type] ?? 'file-document-outline'} />
                <Pill label={st.label} tone={st.tone} icon={st.icon} />
              </View>
              <Text style={[ui.small, { marginTop: 8 }]} numberOfLines={1}>{d.fileName} · subido el {fechaHora(d.uploadedAt)}</Text>
            </Card>
          </TouchableOpacity>
        );
      })}

      {hasMore ? <Button label="Ver más" variant="secondary" loading={loading} onPress={() => cargar(page + 1)} /> : null}

      <DocumentReviewSheet document={selected} onClose={() => setSelected(null)} onReviewed={actualizarEnLista} />
    </Screen>
  );
};

/** Detalle del documento con visor y acciones de revisión. */
type ReviewProps = { document: UserDocument | null; onClose: () => void; onReviewed: (d: UserDocument) => void };
const DocumentReviewSheet: React.FC<ReviewProps> = (props) =>
  props.document ? <DocumentReview key={props.document.id} {...props} document={props.document} /> : null;

const DocumentReview: React.FC<ReviewProps & { document: UserDocument }> = ({ document: d, onClose, onReviewed }) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = DOC_STATUS[d.status];
  const esImagen = d.mimeType.startsWith('image/');

  const revisar = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && reason.trim().length < 5) {
      setError('Explica al usuario por qué se rechaza (mínimo 5 caracteres).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onReviewed(await reviewDocument(d.id, action, action === 'reject' ? reason.trim() : undefined));
      setRejecting(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const footer = d.status !== 'pending' ? (
    <Button label="Cerrar" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
  ) : rejecting ? (
    <>
      <Button label="Volver" variant="ghost" onPress={() => setRejecting(false)} disabled={busy} style={{ flex: 1 }} />
      <Button label="Rechazar documento" icon="close-circle-outline" variant="danger" onPress={() => revisar('reject')} loading={busy} style={{ flex: 1.5 }} />
    </>
  ) : (
    <>
      <Button label="Rechazar" icon="close" variant="danger" onPress={() => setRejecting(true)} disabled={busy} style={{ flex: 1 }} />
      <Button
        label="Aceptar" icon="check" variant="success" loading={busy} style={{ flex: 1 }}
        onPress={() => confirmAction('Aceptar documento', `¿Aceptar ${d.typeLabel.toLowerCase()} de ${d.owner?.fullName}? Se le notificará.`, 'Aceptar', () => revisar('approve'))}
      />
    </>
  );

  return (
    <Sheet visible title={d.typeLabel} icon={DOC_TYPE_ICON[d.type] ?? 'file-document-outline'} onClose={onClose} closeDisabled={busy} footer={footer}>
      <View style={ui.row}>
        <DriverAvatar fullName={d.owner?.fullName} photoUrl={d.owner?.photoUrl} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={ui.label}>{d.owner?.fullName}</Text>
          <Text style={ui.small}>{d.owner?.email} · {d.owner?.userType === 'alumno' ? 'Alumno' : 'Docente'}</Text>
        </View>
      </View>
      <Pill label={st.label} tone={st.tone} icon={st.icon} />
      <Text style={ui.muted}>{d.fileName} · {d.mimeType === 'application/pdf' ? 'PDF' : 'Imagen'} · subido el {fechaHora(d.uploadedAt)}</Text>
      {d.reviewedAt ? <Text style={ui.small}>Revisado el {fechaHora(d.reviewedAt)}</Text> : null}
      {d.status === 'rejected' && d.rejectionReason ? (
        <View style={[ui.notice, { backgroundColor: THEME.colors.errorBg, borderColor: THEME.colors.errorBorder }]}>
          <MaterialCommunityIcons name="message-alert-outline" size={18} color={THEME.colors.error} />
          <Text style={ui.noticeText}>Comentario enviado: {d.rejectionReason}</Text>
        </View>
      ) : null}

      {esImagen && d.viewUrl ? (
        <Image source={{ uri: d.viewUrl }} style={s.preview} resizeMode="contain" accessibilityLabel={`Vista previa de ${d.fileName}`} />
      ) : null}
      {d.viewUrl ? (
        <View style={[ui.row, { flexWrap: 'wrap' }]}>
          <Button label={esImagen ? 'Abrir en grande' : 'Abrir PDF'} icon="open-in-new" variant="secondary" small onPress={() => Linking.openURL(d.viewUrl as string)} />
          <Button label="Descargar" icon="download" variant="ghost" small onPress={() => Linking.openURL(`${d.viewUrl}&download=1`)} />
        </View>
      ) : null}
      <Text style={ui.small}>El enlace del archivo dura 10 minutos; si vence, vuelve a abrir este documento.</Text>

      {rejecting ? (
        <View>
          <Text style={ui.label}>Comentario para el usuario <Text style={{ color: THEME.colors.error }}>*</Text></Text>
          <TextInput
            style={[ui.textArea, { marginTop: 6 }, error ? ui.textAreaError : null]}
            value={reason}
            onChangeText={(t) => { setReason(t.slice(0, 300)); setError(null); }}
            multiline
            placeholder="Ej. El documento no corresponde al semestre actual. Sube tu carga académica vigente."
            placeholderTextColor={THEME.colors.textMuted}
            accessibilityLabel="Motivo del rechazo"
          />
          <Text style={[ui.small, { textAlign: 'right' }]}>{reason.length}/300</Text>
        </View>
      ) : null}
      {error ? <Text style={ui.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </Sheet>
  );
};

const s = StyleSheet.create({
  preview: { width: '100%', height: 260, borderRadius: THEME.borderRadius.md, backgroundColor: THEME.colors.surfaceAlt, borderWidth: 1, borderColor: THEME.colors.border },
});
