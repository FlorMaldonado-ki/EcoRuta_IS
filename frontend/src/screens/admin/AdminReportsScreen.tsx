/**
 * Administración de reportes.
 *   Más recientes / Más antiguos → reportes por atender (excluye los ya leídos Y atendidos).
 *   No leídos / Leídos           → según el estado de lectura del administrador.
 *   Recurrentes                  → usuarios con 6 o más reportes HISTÓRICOS (todos cuentan).
 * Abrir un reporte lo marca como leído; la atención (en revisión, resuelto, descartado) es aparte.
 */
import React, { useCallback, useState } from 'react';
import { useLoader } from '../../hooks/useLoader';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { DriverAvatar } from '../../components/DriverAvatar';
import { Button, Card, Chips, EmptyState, ErrorState, LoadingState, Pill, Screen, Sheet, fecha, fechaHora, styles as ui, type PillTone, type IconName } from '../../components/trust/ui';
import { getAdminReports, getRecurrentUsers, updateAdminReport } from '../../services/adminService';
import { errorMessage } from '../../services/tripService';
import type { RecurrentUsersDTO, ReportDTO, ReportFilter, ReportStatus } from '../../types/trust';

type Tab = ReportFilter | 'recurrent';

const STATUS: Record<ReportStatus, { label: string; tone: PillTone; icon: IconName }> = {
  pending: { label: 'Pendiente', tone: 'warning', icon: 'clock-outline' },
  in_review: { label: 'En revisión', tone: 'primary', icon: 'magnify' },
  resolved: { label: 'Atendido', tone: 'success', icon: 'check-circle-outline' },
  dismissed: { label: 'Descartado', tone: 'neutral', icon: 'cancel' },
};

interface Props {
  onBack: () => void;
  userFilter: { id: string; fullName: string } | null;
  onClearUserFilter: () => void;
  onSelectUser: (u: { id: string; fullName: string }) => void;
}

export const AdminReportsScreen: React.FC<Props> = ({ onBack, userFilter, onClearUserFilter, onSelectUser }) => {
  const [tab, setTab] = useState<Tab>(userFilter ? 'all' : 'recent');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [items, setItems] = useState<ReportDTO[]>([]);
  const [recurrent, setRecurrent] = useState<RecurrentUsersDTO | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<ReportDTO | null>(null);

  const userId = userFilter?.id;
  // La alerta de recurrentes siempre se pide: se muestra arriba en todas las pestañas.
  const fetcher = useCallback((p: number) => Promise.all([
    getRecurrentUsers(),
    tab !== 'recurrent' ? getAdminReports({ filter: tab, reportedUserId: userId, q: appliedQ || undefined, page: p }) : Promise.resolve(null),
  ]), [tab, userId, appliedQ]);
  const { loading, setLoading, error, load: cargar } = useLoader(fetcher, ([rec, r], p) => {
    setRecurrent(rec);
    if (r) {
      setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items]));
      setHasMore(r.hasMore);
      setPage(p);
    }
  });

  const abrir = async (r: ReportDTO) => {
    setSelected(r);
    if (!r.read) {
      try {
        const leido = await updateAdminReport(r.id, { read: true });
        actualizar(leido);
      } catch {
        // si falla, el reporte se sigue mostrando como no leído
      }
    }
  };

  const actualizar = (r: ReportDTO) => {
    setSelected((s) => (s && s.id === r.id ? r : s));
    setItems((l) => l.map((x) => (x.id === r.id ? r : x)));
  };

  const recurrentes = recurrent?.items ?? [];
  const umbral = recurrent?.threshold ?? 6;

  return (
    <Screen
      title={userFilter ? `Reportes de ${userFilter.fullName}` : 'Reportes'}
      subtitle={userFilter ? 'Historial completo de reportes recibidos (leídos, atendidos o no).' : undefined}
      onBack={userFilter ? onClearUserFilter : onBack}
      backLabel={userFilter ? 'Todos los reportes' : 'Volver al panel'}
      headerSubtitle="Administración"
      refreshing={loading}
      onRefresh={() => cargar(1)}
    >
      {!userFilter && recurrentes.length > 0 && tab !== 'recurrent' ? (
        <TouchableOpacity onPress={() => { setLoading(true); setTab('recurrent'); }} activeOpacity={0.85} accessibilityRole="button">
          <Card tone="warning">
            <View style={ui.row}>
              <MaterialCommunityIcons name="alert-outline" size={22} color={THEME.colors.warning} />
              <Text style={[ui.label, { flex: 1 }]}>
                {recurrentes.length === 1 ? `${recurrentes[0].user.fullName} acumula ${recurrentes[0].totalReports} reportes`
                  : `${recurrentes.length} usuarios con ${umbral} o más reportes`}
              </Text>
              <Text style={[ui.label, { color: THEME.colors.warning }]}>Revisar ›</Text>
            </View>
          </Card>
        </TouchableOpacity>
      ) : null}

      {!userFilter ? (
        <Chips<Tab>
          options={[
            { key: 'recent', label: 'Más recientes', icon: 'sort-calendar-descending' },
            { key: 'oldest', label: 'Más antiguos', icon: 'sort-calendar-ascending' },
            { key: 'unread', label: 'No leídos', icon: 'email-outline' },
            { key: 'read', label: 'Leídos', icon: 'email-open-outline' },
            { key: 'recurrent', label: 'Recurrentes', icon: 'account-alert-outline', count: recurrentes.length },
          ]}
          value={tab}
          onChange={(k) => { setLoading(true); setTab(k); }}
        />
      ) : null}

      {(tab === 'recent' || tab === 'oldest') && !userFilter ? (
        <Text style={[ui.small, { marginTop: 8 }]}>Solo reportes por atender: no aparecen los que ya están leídos y atendidos.</Text>
      ) : null}

      {tab !== 'recurrent' && !userFilter ? (
        <View style={[ui.row, { marginTop: 10, marginBottom: 6 }]}>
          <TextInput
            style={[ui.input, { flex: 1 }]}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => { setLoading(true); setAppliedQ(q.trim()); }}
            placeholder="Buscar por nombre (reportado o reportante)"
            placeholderTextColor={THEME.colors.textMuted}
            returnKeyType="search"
            accessibilityLabel="Buscar reportes por nombre"
          />
          <Button label="Buscar" icon="magnify" small onPress={() => { setLoading(true); setAppliedQ(q.trim()); }} />
          {appliedQ ? <Button label="Limpiar" variant="ghost" small onPress={() => { setLoading(true); setQ(''); setAppliedQ(''); }} /> : null}
        </View>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => cargar(1)} /> : null}
      {loading && (tab === 'recurrent' ? !recurrent : items.length === 0) && !error ? <LoadingState /> : null}

      {tab === 'recurrent' ? (
        <>
          <Text style={[ui.muted, { marginVertical: 8 }]}>
            Usuarios que recibieron más de cinco reportes ({umbral} o más). El conteo incluye todos sus reportes históricos, aunque ya estén leídos o atendidos.
          </Text>
          {!loading && recurrentes.length === 0 ? (
            <EmptyState icon="shield-check-outline" title="Ningún usuario acumula reportes recurrentes" />
          ) : null}
          {recurrentes.map((r) => (
            <TouchableOpacity key={r.user.id} onPress={() => onSelectUser(r.user)} activeOpacity={0.85} accessibilityRole="button"
              accessibilityLabel={`Historial de ${r.user.fullName}: ${r.totalReports} reportes`}>
              <Card tone="warning">
                <View style={ui.row}>
                  <DriverAvatar fullName={r.user.fullName} photoUrl={r.user.photoUrl} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={ui.label}>{r.user.fullName}</Text>
                    <Text style={ui.small}>{r.user.email}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={THEME.colors.textMuted} />
                </View>
                <View style={[ui.row, { marginTop: 10, flexWrap: 'wrap' }]}>
                  <Pill label={`${r.totalReports} reportes en total`} tone="warning" icon="flag" />
                  <Pill label={`${r.distinctReporters} personas distintas`} icon="account-multiple-outline" />
                  {r.unreadReports ? <Pill label={`${r.unreadReports} sin leer`} tone="primary" icon="email-outline" /> : null}
                  {r.user.status === 'suspended' ? <Pill label="Cuenta suspendida" tone="error" icon="account-cancel-outline" /> : null}
                </View>
                <Text style={[ui.small, { marginTop: 8 }]}>Último reporte: {fecha(r.lastReportAt)}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <>
          {!loading && !error && items.length === 0 ? (
            <EmptyState icon="flag-checkered" title="No hay reportes en esta vista" />
          ) : null}
          {items.map((r) => <ReportCard key={r.id} report={r} threshold={umbral} onPress={() => abrir(r)} />)}
          {hasMore ? <Button label="Ver más" variant="secondary" loading={loading} onPress={() => cargar(page + 1)} /> : null}
        </>
      )}

      <ReportDetailSheet
        report={selected}
        threshold={umbral}
        onClose={() => setSelected(null)}
        onUpdated={actualizar}
        onViewHistory={(u) => { setSelected(null); onSelectUser(u); }}
        historyActive={!!userFilter}
      />
    </Screen>
  );
};

const ReportCard: React.FC<{ report: ReportDTO; threshold: number; onPress: () => void }> = ({ report: r, threshold, onPress }) => {
  const st = STATUS[r.status];
  const recurrente = (r.reportedUser.totalReports ?? 0) >= threshold;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button"
      accessibilityLabel={`Reporte contra ${r.reportedUser.fullName}, ${r.read ? 'leído' : 'no leído'}, ${st.label}`}>
      <Card style={!r.read ? { borderLeftWidth: 4, borderLeftColor: THEME.colors.primary } : undefined}>
        <View style={ui.row}>
          <DriverAvatar fullName={r.reportedUser.fullName} photoUrl={r.reportedUser.photoUrl} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[ui.label, !r.read && { fontWeight: '900' }]} numberOfLines={1}>{r.reportedUser.fullName}</Text>
            <Text style={ui.small} numberOfLines={1}>Reportado por {r.reporter.fullName} · {fechaHora(r.createdAt)}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={THEME.colors.textMuted} />
        </View>
        <Text style={[ui.muted, { marginTop: 8, fontWeight: '700' }]}>{r.reason === 'otro' && r.reasonOther ? `Otro: ${r.reasonOther}` : r.reasonLabel}</Text>
        <Text style={ui.muted} numberOfLines={2}>{r.description}</Text>
        <View style={[ui.row, { marginTop: 8, flexWrap: 'wrap' }]}>
          <Pill label={r.read ? 'Leído' : 'No leído'} tone={r.read ? 'neutral' : 'primary'} icon={r.read ? 'email-open-outline' : 'email-outline'} />
          <Pill label={st.label} tone={st.tone} icon={st.icon} />
          {recurrente ? <Pill label={`${r.reportedUser.totalReports} reportes`} tone="warning" icon="alert-outline" /> : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
};

type DetailProps = {
  report: ReportDTO | null;
  threshold: number;
  onClose: () => void;
  onUpdated: (r: ReportDTO) => void;
  onViewHistory: (u: { id: string; fullName: string }) => void;
  historyActive: boolean;
};
const ReportDetailSheet: React.FC<DetailProps> = (props) =>
  props.report ? <ReportDetail key={props.report.id} {...props} report={props.report} /> : null;

const ReportDetail: React.FC<DetailProps & { report: ReportDTO }> = ({ report: r, threshold, onClose, onUpdated, onViewHistory, historyActive }) => {
  const [note, setNote] = useState(r.adminNote ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS[r.status];

  const cambiar = async (key: string, changes: { read?: boolean; status?: ReportStatus; note?: string }) => {
    setBusy(key);
    setError(null);
    try {
      onUpdated(await updateAdminReport(r.id, { ...changes, ...(note.trim() && note.trim() !== (r.adminNote ?? '') ? { note: note.trim() } : {}) }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const total = r.reportedUser.totalReports ?? 0;

  return (
    <Sheet visible title="Detalle del reporte" icon="flag-outline" onClose={onClose} closeDisabled={!!busy}
      footer={<Button label="Cerrar" variant="secondary" onPress={onClose} disabled={!!busy} style={{ flex: 1 }} />}>
      <View style={[ui.row, { flexWrap: 'wrap' }]}>
        <Pill label={r.read ? `Leído ${r.readAt ? fecha(r.readAt) : ''}` : 'No leído'} tone={r.read ? 'neutral' : 'primary'} icon="email-open-outline" />
        <Pill label={st.label} tone={st.tone} icon={st.icon} />
      </View>

      <Text style={ui.small}>Recibido el {fechaHora(r.createdAt)}</Text>

      <PersonBlock title="Usuario reportado" name={r.reportedUser.fullName} email={r.reportedUser.email} photoUrl={r.reportedUser.photoUrl}
        extra={r.reportedUser.status === 'suspended' ? 'Cuenta suspendida' : undefined} />
      {total >= threshold ? (
        <View style={[ui.notice, { backgroundColor: THEME.colors.warningBg, borderColor: THEME.colors.warningBorder }]}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={THEME.colors.warning} />
          <Text style={ui.noticeText}>Este usuario acumula {total} reportes en total.</Text>
        </View>
      ) : null}
      {!historyActive ? (
        <Button label={`Ver historial (${total} ${total === 1 ? 'reporte' : 'reportes'})`} icon="history" variant="secondary" small
          style={{ alignSelf: 'flex-start' }} onPress={() => onViewHistory({ id: r.reportedUser.id, fullName: r.reportedUser.fullName })} />
      ) : null}

      <PersonBlock title="Reportado por" name={r.reporter.fullName} email={r.reporter.email} photoUrl={r.reporter.photoUrl} />

      <View>
        <Text style={ui.label}>Motivo</Text>
        <Text style={ui.muted}>{r.reasonLabel}{r.reasonOther ? `: ${r.reasonOther}` : ''}</Text>
      </View>
      <View>
        <Text style={ui.label}>Descripción</Text>
        <Text style={[ui.muted, { color: THEME.colors.textPrimary }]}>{r.description}</Text>
      </View>
      {r.trip ? (
        <View>
          <Text style={ui.label}>Viaje relacionado</Text>
          <Text style={ui.muted}>{r.trip.origin} → {r.trip.destination}</Text>
          <Text style={ui.small}>{fechaHora(r.trip.departureAt)}</Text>
        </View>
      ) : (
        <Text style={ui.small}>Sin viaje relacionado.</Text>
      )}

      <View>
        <Text style={ui.label}>Nota interna (opcional)</Text>
        <TextInput
          style={[ui.textArea, { marginTop: 6, minHeight: 70 }]}
          value={note}
          onChangeText={(t) => setNote(t.slice(0, 500))}
          multiline
          placeholder="Qué se hizo o se decidió (solo la ve administración)"
          placeholderTextColor={THEME.colors.textMuted}
          accessibilityLabel="Nota interna"
        />
        {r.reviewedAt ? <Text style={ui.small}>Última revisión: {fechaHora(r.reviewedAt)}</Text> : null}
      </View>

      <Text style={ui.label}>Atención</Text>
      <View style={[ui.row, { flexWrap: 'wrap' }]}>
        {r.status !== 'in_review' ? (
          <Button label="En revisión" icon="magnify" variant="secondary" small loading={busy === 'in_review'} disabled={!!busy}
            onPress={() => cambiar('in_review', { status: 'in_review' })} />
        ) : null}
        {r.status !== 'resolved' ? (
          <Button label="Marcar atendido" icon="check" variant="success" small loading={busy === 'resolved'} disabled={!!busy}
            onPress={() => cambiar('resolved', { status: 'resolved' })} />
        ) : null}
        {r.status !== 'dismissed' ? (
          <Button label="Descartar" icon="cancel" variant="ghost" small loading={busy === 'dismissed'} disabled={!!busy}
            onPress={() => cambiar('dismissed', { status: 'dismissed' })} />
        ) : null}
        {r.attended ? (
          <Button label="Reabrir" icon="restore" variant="ghost" small loading={busy === 'pending'} disabled={!!busy}
            onPress={() => cambiar('pending', { status: 'pending' })} />
        ) : null}
      </View>
      <View style={[ui.row, { flexWrap: 'wrap' }]}>
        {r.read ? (
          <Button label="Marcar como no leído" icon="email-outline" variant="ghost" small loading={busy === 'unread'} disabled={!!busy}
            onPress={() => cambiar('unread', { read: false })} />
        ) : null}
        {note.trim() !== (r.adminNote ?? '') && note.trim() ? (
          <Button label="Guardar nota" icon="content-save-outline" variant="secondary" small loading={busy === 'note'} disabled={!!busy}
            onPress={() => cambiar('note', {})} />
        ) : null}
      </View>
      <Text style={ui.small}>Ninguna cuenta se suspende automáticamente. Para suspender, ve a Usuarios.</Text>
      {error ? <Text style={ui.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </Sheet>
  );
};

const PersonBlock: React.FC<{ title: string; name: string; email?: string; photoUrl: string | null; extra?: string }> = ({ title, name, email, photoUrl, extra }) => (
  <View>
    <Text style={ui.label}>{title}</Text>
    <View style={[ui.row, { marginTop: 6 }]}>
      <DriverAvatar fullName={name} photoUrl={photoUrl} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={ui.label}>{name}</Text>
        {email ? <Text style={ui.small}>{email}</Text> : null}
        {extra ? <Text style={[ui.small, { color: THEME.colors.error }]}>{extra}</Text> : null}
      </View>
    </View>
  </View>
);
