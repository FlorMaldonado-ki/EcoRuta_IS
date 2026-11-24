/**
 * Panel de administración (RF-29, RF-30). Navegación propia, separada de la del usuario.
 * Solo se llega aquí desde el menú cuando user.role === 'admin'; aun así, cada
 * petición la autoriza la API (requireRole('admin')): ocultar no es la seguridad.
 */
import React, { useCallback, useState } from 'react';
import { useLoader } from '../../hooks/useLoader';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { DriverAvatar } from '../../components/DriverAvatar';
import { Card, ErrorState, LoadingState, Pill, Screen, fecha, styles as ui, type IconName } from '../../components/trust/ui';
import { getAdminSummary, getRecurrentUsers } from '../../services/adminService';
import { formatKg } from '../../utils/format';
import { AdminDocumentsScreen } from './AdminDocumentsScreen';
import { AdminReportsScreen } from './AdminReportsScreen';
import { AdminUsersScreen } from './AdminUsersScreen';
import type { UserDTO } from '../../types/api';
import type { AdminSummary, RecurrentUsersDTO } from '../../types/trust';

type Section = 'dashboard' | 'documents' | 'reports' | 'users';

interface Props {
  currentUser: UserDTO;
  onExit: () => void;
}

export const AdminPanelScreen: React.FC<Props> = ({ currentUser, onExit }) => {
  const [section, setSection] = useState<Section>('dashboard');
  // Historial de reportes de un usuario (desde la alerta o desde Usuarios)
  const [reportsUser, setReportsUser] = useState<{ id: string; fullName: string } | null>(null);

  const verReportesDe = (u: { id: string; fullName: string }) => {
    setReportsUser(u);
    setSection('reports');
  };
  const volver = () => {
    setReportsUser(null);
    setSection('dashboard');
  };

  if (section === 'documents') return <AdminDocumentsScreen onBack={volver} />;
  if (section === 'reports') {
    return <AdminReportsScreen key={reportsUser?.id ?? 'todos'} onBack={volver} userFilter={reportsUser} onClearUserFilter={() => setReportsUser(null)} onSelectUser={verReportesDe} />;
  }
  if (section === 'users') return <AdminUsersScreen currentUser={currentUser} onBack={volver} onViewReports={verReportesDe} />;

  return <AdminDashboard onExit={onExit} onGo={setSection} onViewReports={verReportesDe} />;
};

const AdminDashboard: React.FC<{
  onExit: () => void;
  onGo: (s: Section) => void;
  onViewReports: (u: { id: string; fullName: string }) => void;
}> = ({ onExit, onGo, onViewReports }) => {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [recurrent, setRecurrent] = useState<RecurrentUsersDTO | null>(null);

  const fetcher = useCallback(() => Promise.all([getAdminSummary(), getRecurrentUsers()]), []);
  const { loading, error, load: cargar } = useLoader(fetcher, ([sum, rec]) => {
    setSummary(sum);
    setRecurrent(rec);
  });

  return (
    <Screen
      title="Panel de administración"
      subtitle="Revisa documentos, atiende reportes y consulta a los usuarios."
      onBack={onExit}
      backLabel="Salir del panel"
      headerSubtitle="Administración"
      refreshing={loading}
      onRefresh={cargar}
    >
      {loading && !summary ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={cargar} /> : null}

      {recurrent && recurrent.items.length > 0 ? (
        <Card tone="warning">
          <View style={ui.row}>
            <MaterialCommunityIcons name="alert-outline" size={22} color={THEME.colors.warning} />
            <Text style={[ui.label, { flex: 1, fontSize: 15 }]}>
              {recurrent.items.length === 1 ? '1 usuario' : `${recurrent.items.length} usuarios`} con {recurrent.threshold} o más reportes
            </Text>
          </View>
          <Text style={[ui.muted, { marginTop: 4, marginBottom: 6 }]}>
            Cuenta todos sus reportes históricos, incluso los ya leídos o atendidos. Revisa su historial: ninguna cuenta se suspende sola.
          </Text>
          {recurrent.items.map((r) => (
            <TouchableOpacity
              key={r.user.id}
              style={s.alertRow}
              onPress={() => onViewReports(r.user)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Ver historial de reportes de ${r.user.fullName}`}
            >
              <DriverAvatar fullName={r.user.fullName} photoUrl={r.user.photoUrl} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={ui.label} numberOfLines={1}>{r.user.fullName}</Text>
                <Text style={ui.small}>Último: {fecha(r.lastReportAt)} · {r.unreadReports} sin leer</Text>
              </View>
              <Pill label={`${r.totalReports} reportes`} tone="warning" icon="flag" />
              {r.user.status === 'suspended' ? <Pill label="Suspendido" tone="error" /> : null}
              <MaterialCommunityIcons name="chevron-right" size={20} color={THEME.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </Card>
      ) : null}

      {summary ? (
        <>
          <View style={s.grid}>
            <Tile icon="file-document-multiple-outline" title="Documentos" value={summary.documents.pending}
              caption={summary.documents.pending === 1 ? 'pendiente de revisión' : 'pendientes de revisión'}
              highlight={summary.documents.pending > 0} onPress={() => onGo('documents')} />
            <Tile icon="flag-outline" title="Reportes" value={summary.reports.unread}
              caption={`sin leer · ${summary.reports.toAttend} por atender`}
              highlight={summary.reports.unread > 0} onPress={() => onGo('reports')} />
            <Tile icon="account-group-outline" title="Usuarios" value={summary.users.total}
              caption={`${summary.users.active} activos · ${summary.users.suspended} suspendidos`} onPress={() => onGo('users')} />
          </View>

          <Text style={[ui.label, { marginTop: 8, marginBottom: 8, fontSize: 15 }]}>Estadísticas</Text>
          <Card>
            <Stat icon="car-multiple" label="Viajes finalizados" value={`${summary.trips.finished} de ${summary.trips.total}`} />
            <Stat icon="calendar-arrow-right" label="Viajes publicados por salir" value={String(summary.trips.published)} />
            <Stat icon="leaf" label="CO₂ ahorrado por la comunidad" value={formatKg(summary.co2SavedKg)} />
            <Stat icon="star-outline" label="Calificación promedio"
              value={summary.ratings.average !== null ? `${summary.ratings.average.toFixed(2)} ★ (${summary.ratings.count})` : 'Sin calificaciones'} />
            <Stat icon="account-clock-outline" label="Cuentas sin verificar correo" value={String(summary.users.pending)} last />
          </Card>
        </>
      ) : null}
    </Screen>
  );
};

const Tile: React.FC<{ icon: IconName; title: string; value: number; caption: string; onPress: () => void; highlight?: boolean }> = ({
  icon, title, value, caption, onPress, highlight,
}) => (
  <TouchableOpacity style={[s.tile, highlight && s.tileHighlight]} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${title}: ${value} ${caption}`}>
    <View style={ui.row}>
      <MaterialCommunityIcons name={icon} size={22} color={THEME.colors.primary} />
      <Text style={[ui.label, { flex: 1 }]}>{title}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={THEME.colors.textMuted} />
    </View>
    <Text style={s.tileValue}>{value}</Text>
    <Text style={ui.small}>{caption}</Text>
  </TouchableOpacity>
);

const Stat: React.FC<{ icon: IconName; label: string; value: string; last?: boolean }> = ({ icon, label, value, last }) => (
  <View style={[s.stat, last && { borderBottomWidth: 0 }]}>
    <MaterialCommunityIcons name={icon} size={18} color={THEME.colors.accentDark} />
    <Text style={[ui.muted, { flex: 1 }]}>{label}</Text>
    <Text style={ui.label}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  tile: { flexGrow: 1, flexBasis: 200, backgroundColor: THEME.colors.surface, borderRadius: THEME.borderRadius.lg, padding: 16, borderWidth: 1, borderColor: THEME.colors.border, ...THEME.shadows.card, minHeight: 120 },
  tileHighlight: { borderColor: THEME.colors.accent, borderWidth: 1.5 },
  tileValue: { fontSize: 30, fontWeight: '900', color: THEME.colors.primary, marginTop: 6 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: THEME.colors.warningBorder, minHeight: 52, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
});
