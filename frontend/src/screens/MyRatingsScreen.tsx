/**
 * "Mis calificaciones" (RF-27), para conductor y pasajero por igual.
 *   Recibidas: promedio, estrellas, cuántas y la lista con comentarios vigentes.
 *   Escritas por mí: la puntuación es definitiva (candado); el comentario se
 *   edita o borra mientras esté vigente (30 días desde que se publicó).
 */
import React, { useCallback, useState } from 'react';
import { useLoader } from '../hooks/useLoader';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { DriverAvatar } from '../components/DriverAvatar';
import {
  Button, Card, Chips, EmptyState, ErrorState, LoadingState, Pill, Screen, Sheet, Stars, fecha, styles as ui,
} from '../components/trust/ui';
import { deleteRatingComment, getMyGivenRatings, getMyReceivedRatings, updateRatingComment } from '../services/trustService';
import { errorMessage } from '../services/tripService';
import { confirmAction } from '../utils/notify';
import type { UserDTO } from '../types/api';
import type { GivenRating, GivenRatingsPage, ReceivedRating, ReceivedRatingsPage, RatingSummary } from '../types/trust';

interface Props {
  currentUser: UserDTO;
  onBack: () => void;
  onGoToMyTrips: () => void;
}

type Tab = 'received' | 'given';
const MAX_COMENTARIO = 280;

export const MyRatingsScreen: React.FC<Props> = ({ currentUser, onBack, onGoToMyTrips }) => {
  const [tab, setTab] = useState<Tab>('received');
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [retention, setRetention] = useState(30);
  const [received, setReceived] = useState<ReceivedRating[]>([]);
  const [given, setGiven] = useState<GivenRating[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GivenRating | null>(null);

  type Respuesta = { kind: 'received'; r: ReceivedRatingsPage } | { kind: 'given'; r: GivenRatingsPage };
  const fetcher = useCallback(
    (p: number): Promise<Respuesta> => (tab === 'received'
      ? getMyReceivedRatings(p).then((r) => ({ kind: 'received' as const, r }))
      : getMyGivenRatings(p).then((r) => ({ kind: 'given' as const, r }))),
    [tab],
  );
  const { loading, setLoading, error, load } = useLoader(fetcher, (res, p) => {
    setRetention(res.r.commentRetentionDays);
    if (res.kind === 'received') {
      const items = res.r.items;
      setSummary(res.r.summary);
      setReceived((prev) => (p === 1 ? items : [...prev, ...items]));
    } else {
      const items = res.r.items;
      setGiven((prev) => (p === 1 ? items : [...prev, ...items]));
    }
    setHasMore(res.r.hasMore);
    setPage(p);
  });

  const reemplazar = (r: GivenRating) => setGiven((l) => l.map((x) => (x.id === r.id ? r : x)));

  const borrar = (r: GivenRating) =>
    confirmAction(
      'Eliminar comentario',
      'Se borra solo el comentario. Tus estrellas se conservan y no se pueden cambiar.',
      'Eliminar comentario',
      async () => {
        try {
          reemplazar(await deleteRatingComment(r.id));
        } catch (err) {
          setActionError(errorMessage(err));
        }
      },
    );

  return (
    <Screen
      title="Mis calificaciones"
      subtitle="Lo que opinan quienes viajaron contigo y lo que tú escribiste."
      onBack={onBack}
      backLabel="Volver al inicio"
      refreshing={loading}
      onRefresh={() => load(1)}
    >
      <Card>
        <View style={ui.row}>
          <DriverAvatar fullName={currentUser.fullName} photoUrl={currentUser.photoUrl} size={60} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[ui.label, { fontSize: 16 }]} numberOfLines={2}>{currentUser.fullName}</Text>
            {summary && summary.count > 0 && summary.average !== null ? (
              <>
                <View style={ui.row}>
                  <Text style={s.average}>{summary.average.toFixed(1)}</Text>
                  <Stars value={summary.average} size={20} />
                </View>
                <Text style={ui.small}>{summary.count} {summary.count === 1 ? 'calificación recibida' : 'calificaciones recibidas'}</Text>
              </>
            ) : (
              <Text style={ui.muted}>{summary ? 'Aún no tienes calificaciones.' : ' '}</Text>
            )}
          </View>
        </View>
        {summary && summary.count > 0 ? (
          <View style={{ marginTop: 12, gap: 4 }}>
            {(['5', '4', '3', '2', '1'] as const).map((k) => {
              const n = summary.distribution[k];
              return (
                <View key={k} style={ui.row} accessibilityLabel={`${k} estrellas: ${n}`}>
                  <Text style={[ui.small, { width: 26 }]}>{k} ★</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${summary.count ? (n / summary.count) * 100 : 0}%` }]} />
                  </View>
                  <Text style={[ui.small, { width: 26, textAlign: 'right' }]}>{n}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </Card>

      <Chips<Tab>
        options={[
          { key: 'received', label: 'Recibidas', icon: 'star-outline' },
          { key: 'given', label: 'Escritas por mí', icon: 'pencil-outline' },
        ]}
        value={tab}
        onChange={(k) => { setLoading(true); setTab(k); }}
      />
      <View style={{ height: 12 }} />

      {error ? <ErrorState message={error} onRetry={() => load(1)} /> : null}
      {actionError ? <Text style={ui.fieldError} accessibilityRole="alert">{actionError}</Text> : null}
      {loading && !error && (tab === 'received' ? received : given).length === 0 ? <LoadingState /> : null}

      {!loading && !error && tab === 'received' && received.length === 0 ? (
        <EmptyState
          icon="star-shooting-outline"
          title="Todavía no tienes calificaciones"
          message="Cuando termines un viaje, las personas con las que viajaste podrán calificarte."
          action={<Button label="Ver mis viajes" icon="calendar-check" variant="secondary" small onPress={onGoToMyTrips} />}
        />
      ) : null}
      {!loading && !error && tab === 'given' && given.length === 0 ? (
        <EmptyState icon="pencil-off-outline" title="Aún no has calificado a nadie" message="Podrás calificar desde el detalle de un viaje finalizado." />
      ) : null}

      {tab === 'received' && received.map((r) => (
        <Card key={r.id}>
          <View style={ui.row}>
            <DriverAvatar fullName={r.rater.fullName} photoUrl={r.rater.photoUrl} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={ui.label} numberOfLines={1}>{r.rater.fullName}</Text>
              <Text style={ui.small}>{r.raterRole === 'driver' ? 'Conductor' : 'Pasajero'} · {fecha(r.createdAt)}</Text>
            </View>
            <Stars value={r.score} size={16} />
          </View>
          {r.comment ? <Text style={s.comment}>“{r.comment}”</Text> : null}
          {r.commentExpired ? <Text style={[ui.small, { marginTop: 8 }]}>El comentario ya no se muestra (pasaron más de {retention} días).</Text> : null}
          {r.trip ? <Text style={[ui.small, { marginTop: 6 }]} numberOfLines={1}>{r.trip.origin} → {r.trip.destination}</Text> : null}
        </Card>
      ))}

      {tab === 'given' && given.map((r) => (
        <Card key={r.id}>
          <View style={ui.row}>
            <DriverAvatar fullName={r.ratedUser.fullName} photoUrl={r.ratedUser.photoUrl} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={ui.label} numberOfLines={1}>{r.ratedUser.fullName}</Text>
              <Text style={ui.small}>{fecha(r.createdAt)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Stars value={r.score} size={16} />
              <Pill label="Definitiva" icon="lock-outline" />
            </View>
          </View>
          {r.comment ? (
            <>
              <Text style={s.comment}>“{r.comment}”</Text>
              <Text style={ui.small}>
                {r.commentEditedAt ? 'Editado · ' : ''}Visible hasta el {fecha(r.commentExpiresAt)}
              </Text>
            </>
          ) : (
            <Text style={[ui.small, { marginTop: 8 }]}>
              {r.commentExpired ? `El comentario ya no se muestra (más de ${retention} días).` : r.commentDeletedAt ? 'Eliminaste el comentario.' : 'Sin comentario.'}
            </Text>
          )}
          <View style={[ui.row, { marginTop: 10, flexWrap: 'wrap' }]}>
            {r.canEditComment ? (
              <>
                <Button label="Editar comentario" icon="pencil-outline" variant="secondary" small onPress={() => setEditing(r)} />
                <Button label="Eliminar comentario" icon="delete-outline" variant="danger" small onPress={() => borrar(r)} />
              </>
            ) : r.canAddComment ? (
              <Button label="Agregar comentario" icon="comment-plus-outline" variant="secondary" small onPress={() => setEditing(r)} />
            ) : null}
          </View>
        </Card>
      ))}

      {hasMore ? (
        <Button label="Ver más" variant="secondary" loading={loading} onPress={() => load(page + 1)} />
      ) : null}

      <EditCommentModal
        rating={editing}
        onClose={() => setEditing(null)}
        onSaved={(r) => { reemplazar(r); setEditing(null); }}
      />
    </Screen>
  );
};

/** Editar o escribir el comentario. La puntuación se muestra bloqueada. */
type EditProps = { rating: GivenRating | null; onClose: () => void; onSaved: (r: GivenRating) => void };
const EditCommentModal: React.FC<EditProps> = (props) =>
  props.rating ? <EditCommentForm key={props.rating.id} {...props} rating={props.rating} /> : null;

const EditCommentForm: React.FC<EditProps & { rating: GivenRating }> = ({ rating, onClose, onSaved }) => {
  const [text, setText] = useState(rating.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    if (!text.trim()) { setError('Escribe tu comentario. Para quitarlo usa "Eliminar comentario".'); return; }
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateRatingComment(rating.id, text.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      title={rating.comment ? 'Editar comentario' : 'Agregar comentario'}
      icon="comment-edit-outline"
      onClose={onClose}
      closeDisabled={saving}
      footer={(
        <>
          <Button label="Cancelar" variant="ghost" onPress={onClose} disabled={saving} style={{ flex: 1 }} />
          <Button label="Guardar" icon="content-save-outline" onPress={guardar} loading={saving} style={{ flex: 1 }} />
        </>
      )}
    >
      <View style={ui.row}>
        <Text style={ui.label}>Para {rating.ratedUser.fullName}</Text>
      </View>
      <View style={[ui.row, { gap: 6 }]}>
        <Stars value={rating.score} size={20} />
        <MaterialCommunityIcons name="lock-outline" size={16} color={THEME.colors.textMuted} />
        <Text style={ui.small}>La puntuación no se puede cambiar</Text>
      </View>
      <TextInput
        style={[ui.textArea, error ? ui.textAreaError : null]}
        value={text}
        onChangeText={(t) => { setText(t.slice(0, MAX_COMENTARIO)); setError(null); }}
        multiline
        placeholder="Tu comentario"
        placeholderTextColor={THEME.colors.textMuted}
        accessibilityLabel="Comentario"
      />
      <Text style={[ui.small, { textAlign: 'right' }]}>{text.length}/{MAX_COMENTARIO}</Text>
      {error ? <Text style={ui.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </Sheet>
  );
};

const s = StyleSheet.create({
  average: { fontSize: 26, fontWeight: '900', color: THEME.colors.primary },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: THEME.colors.surfaceAlt, overflow: 'hidden', borderWidth: 1, borderColor: THEME.colors.border },
  barFill: { height: '100%', backgroundColor: THEME.colors.accent },
  comment: { fontSize: 14, color: THEME.colors.textPrimary, marginTop: 10, lineHeight: 20, fontStyle: 'italic' },
});
