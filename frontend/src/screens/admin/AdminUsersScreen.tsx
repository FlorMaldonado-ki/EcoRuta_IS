/**
 * Usuarios (RF-29): búsqueda, estado, calificación, reportes recibidos y documento.
 * Suspender o reactivar es siempre una decisión manual del administrador (con confirmación).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useLoader } from '../../hooks/useLoader';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { DriverAvatar } from '../../components/DriverAvatar';
import { Button, Card, Chips, EmptyState, ErrorState, LoadingState, Pill, Screen, Sheet, Stars, fecha, styles as ui, type PillTone } from '../../components/trust/ui';
import { DOC_STATUS } from '../MyDocumentsScreen';
import { getAdminUsers, getUserRatings, setUserStatus } from '../../services/adminService';
import { errorMessage } from '../../services/tripService';
import { confirmAction } from '../../utils/notify';
import type { UserDTO } from '../../types/api';
import type { AdminUser, ReceivedRatingsPage } from '../../types/trust';

type StatusKey = 'all' | 'active' | 'pending' | 'suspended';
const ESTADO: Record<AdminUser['status'], { label: string; tone: PillTone }> = {
  active: { label: 'Activo', tone: 'success' },
  pending: { label: 'Sin verificar', tone: 'warning' },
  suspended: { label: 'Suspendido', tone: 'error' },
};

interface Props {
  currentUser: UserDTO;
  onBack: () => void;
  onViewReports: (u: { id: string; fullName: string }) => void;
}

export const AdminUsersScreen: React.FC<Props> = ({ currentUser, onBack, onViewReports }) => {
  const [status, setStatus] = useState<StatusKey>('all');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [items, setItems] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const fetcher = useCallback((p: number) => getAdminUsers({ status: status === 'all' ? undefined : status, q: appliedQ || undefined, page: p }), [status, appliedQ]);
  // Al cambiar un filtro cambia `fetcher` y se vuelve a pedir (quien cambia el filtro enciende el aviso de carga).
  const { loading, setLoading, error, load: cargar } = useLoader(fetcher, (r, p) => {
    setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items]));
    setHasMore(r.hasMore);
    setPage(p);
  });

  const actualizar = (u: AdminUser) => {
    setItems((l) => l.map((x) => (x.id === u.id ? u : x)));
    setSelected(u);
  };

  return (
    <Screen title="Usuarios" onBack={onBack} backLabel="Volver al panel" headerSubtitle="Administración" refreshing={loading} onRefresh={() => cargar(1)}>
      <View style={[ui.row, { marginBottom: 10 }]}>
        <TextInput
          style={[ui.input, { flex: 1 }]}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => { setLoading(true); setAppliedQ(q.trim()); }}
          placeholder="Nombre o correo"
          placeholderTextColor={THEME.colors.textMuted}
          returnKeyType="search"
          accessibilityLabel="Buscar usuarios"
        />
        <Button label="Buscar" icon="magnify" small onPress={() => { setLoading(true); setAppliedQ(q.trim()); }} />
      </View>
      <Chips<StatusKey>
        options={[
          { key: 'all', label: 'Todos' },
          { key: 'active', label: 'Activos', icon: 'account-check-outline' },
          { key: 'pending', label: 'Sin verificar', icon: 'account-clock-outline' },
          { key: 'suspended', label: 'Suspendidos', icon: 'account-cancel-outline' },
        ]}
        value={status}
        onChange={(k) => { setLoading(true); setStatus(k); }}
      />
      <View style={{ height: 10 }} />

      {error ? <ErrorState message={error} onRetry={() => cargar(1)} /> : null}
      {loading && items.length === 0 && !error ? <LoadingState /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState icon="account-search-outline" title="No encontramos usuarios" /> : null}

      {items.map((u) => (
        <TouchableOpacity key={u.id} onPress={() => setSelected(u)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${u.fullName}, ${ESTADO[u.status].label}`}>
          <Card>
            <View style={ui.row}>
              <DriverAvatar fullName={u.fullName} photoUrl={u.photoUrl} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={ui.label} numberOfLines={1}>{u.fullName}{u.role === 'admin' ? ' · Admin' : ''}</Text>
                <Text style={ui.small} numberOfLines={1}>{u.email}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={THEME.colors.textMuted} />
            </View>
            <View style={[ui.row, { marginTop: 10, flexWrap: 'wrap' }]}>
              <Pill label={ESTADO[u.status].label} tone={ESTADO[u.status].tone} />
              {u.ratingAverage !== null ? <Pill label={`${u.ratingAverage.toFixed(1)} ★ (${u.ratingCount})`} tone="accent" /> : null}
              {u.reportsReceived ? (
                <Pill label={`${u.reportsReceived} ${u.reportsReceived === 1 ? 'reporte' : 'reportes'}`} tone={u.recurrent ? 'warning' : 'neutral'} icon={u.recurrent ? 'alert-outline' : 'flag-outline'} />
              ) : null}
            </View>
          </Card>
        </TouchableOpacity>
      ))}
      {hasMore ? <Button label="Ver más" variant="secondary" loading={loading} onPress={() => cargar(page + 1)} /> : null}

      <UserDetailSheet
        user={selected}
        isSelf={selected?.id === currentUser.id}
        onClose={() => setSelected(null)}
        onUpdated={actualizar}
        onViewReports={(u) => { setSelected(null); onViewReports(u); }}
      />
    </Screen>
  );
};

type UserDetailProps = {
  user: AdminUser | null;
  isSelf: boolean;
  onClose: () => void;
  onUpdated: (u: AdminUser) => void;
  onViewReports: (u: { id: string; fullName: string }) => void;
};
const UserDetailSheet: React.FC<UserDetailProps> = (props) =>
  props.user ? <UserDetail key={props.user.id} {...props} user={props.user} /> : null;

const UserDetail: React.FC<UserDetailProps & { user: AdminUser }> = ({ user: u, isSelf, onClose, onUpdated, onViewReports }) => {
  const [ratings, setRatings] = useState<ReceivedRatingsPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = u.id;
  const conCalificaciones = u.ratingCount > 0;

  useEffect(() => {
    let vivo = true;
    if (conCalificaciones) getUserRatings(userId).then((r) => { if (vivo) setRatings(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [userId, conCalificaciones]);

  const cambiar = (action: 'suspend' | 'activate') => {
    const texto = action === 'suspend'
      ? `${u.fullName} no podrá iniciar sesión ni usar la app hasta que reactives su cuenta.`
      : `${u.fullName} podrá volver a usar la app.`;
    confirmAction(action === 'suspend' ? 'Suspender cuenta' : 'Reactivar cuenta', texto, action === 'suspend' ? 'Suspender' : 'Reactivar', async () => {
      setBusy(true);
      setError(null);
      try {
        onUpdated(await setUserStatus(u.id, action));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    });
  };

  const puedeCambiar = !isSelf && u.role !== 'admin';
  const doc = u.documentStatus ? DOC_STATUS[u.documentStatus] : null;

  return (
    <Sheet visible title={u.fullName} icon="account-outline" onClose={onClose} closeDisabled={busy}
      footer={(
        <>
          {puedeCambiar && u.status !== 'suspended' ? (
            <Button label="Suspender cuenta" icon="account-cancel-outline" variant="danger" loading={busy} onPress={() => cambiar('suspend')} style={{ flex: 1 }} />
          ) : null}
          {puedeCambiar && u.status === 'suspended' ? (
            <Button label="Reactivar cuenta" icon="account-check-outline" variant="success" loading={busy} onPress={() => cambiar('activate')} style={{ flex: 1 }} />
          ) : null}
          <Button label="Cerrar" variant="secondary" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
        </>
      )}>
      <View style={ui.row}>
        <DriverAvatar fullName={u.fullName} photoUrl={u.photoUrl} size={56} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={ui.small}>{u.email}</Text>
          <Text style={ui.small}>{u.userType === 'alumno' ? 'Alumno' : 'Docente'}{u.affiliation ? ` · ${u.affiliation}` : ''}</Text>
          <View style={[ui.row, { flexWrap: 'wrap' }]}>
            <Pill label={ESTADO[u.status].label} tone={ESTADO[u.status].tone} />
            {u.role === 'admin' ? <Pill label="Administrador" tone="primary" icon="shield-account-outline" /> : null}
          </View>
        </View>
      </View>

      <Card style={{ marginBottom: 0 }}>
        <Row label="Registro" value={fecha(u.createdAt)} />
        <Row label="Teléfono" value={u.phone ?? '—'} />
        <Row label="Viajes como conductor" value={String(u.tripsAsDriver)} />
        <Row label="Viajes como pasajero" value={String(u.tripsAsPassenger)} />
        <Row label="Documento" value={doc ? doc.label : 'Sin documento'} />
        <Row label="Reportes recibidos" value={String(u.reportsReceived)} last />
      </Card>

      {u.recurrent ? (
        <View style={[ui.notice, { backgroundColor: THEME.colors.warningBg, borderColor: THEME.colors.warningBorder }]}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={THEME.colors.warning} />
          <Text style={ui.noticeText}>Acumula {u.reportsReceived} reportes (más de cinco). Revisa su historial antes de decidir.</Text>
        </View>
      ) : null}
      {u.reportsReceived > 0 ? (
        <Button label="Ver sus reportes" icon="flag-outline" variant="secondary" small style={{ alignSelf: 'flex-start' }}
          onPress={() => onViewReports({ id: u.id, fullName: u.fullName })} />
      ) : null}

      <View>
        <Text style={ui.label}>Calificaciones recibidas</Text>
        {u.ratingAverage !== null ? (
          <View style={[ui.row, { marginTop: 4 }]}>
            <Stars value={u.ratingAverage} size={18} />
            <Text style={ui.muted}>{u.ratingAverage.toFixed(2)} · {u.ratingCount}</Text>
          </View>
        ) : <Text style={ui.muted}>Sin calificaciones.</Text>}
        {ratings?.items.slice(0, 5).map((r) => (
          <View key={r.id} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: THEME.colors.border }}>
            <View style={ui.row}>
              <Stars value={r.score} size={14} />
              <Text style={ui.small}>{r.rater.fullName} · {fecha(r.createdAt)}</Text>
            </View>
            {r.comment ? <Text style={ui.muted}>“{r.comment}”</Text> : null}
          </View>
        ))}
      </View>

      {!puedeCambiar ? <Text style={ui.small}>{isSelf ? 'No puedes cambiar el estado de tu propia cuenta.' : 'Las cuentas de administrador no se suspenden desde la app.'}</Text> : null}
      {error ? <Text style={ui.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </Sheet>
  );
};

const Row: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View style={[ui.row, { justifyContent: 'space-between', paddingVertical: 6 }, !last && { borderBottomWidth: 1, borderBottomColor: THEME.colors.border }]}>
    <Text style={ui.muted}>{label}</Text>
    <Text style={ui.label}>{value}</Text>
  </View>
);
