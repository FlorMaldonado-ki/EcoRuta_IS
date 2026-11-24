/**
 * Piezas visuales compartidas por las pantallas del módulo 3.1.5
 * (calificaciones, reportes, contacto de emergencia, documentos y administración).
 * Siguen la identidad de EcoRuta: guinda, dorado y fondos claros.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Modal,
  KeyboardAvoidingView, Platform, RefreshControl, type StyleProp, type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { Header } from '../Header';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// ── Estrellas ───────────────────────────────────────────────────────────────
interface StarsProps {
  value: number;           // admite decimales para mostrar promedios
  size?: number;
  onChange?: (v: number) => void; // si se pasa, las estrellas se pueden tocar
  disabled?: boolean;
}

const ETIQUETA_ESTRELLAS = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
export const starLabel = (n: number) => ETIQUETA_ESTRELLAS[n] ?? '';

export const Stars: React.FC<StarsProps> = ({ value, size = 18, onChange, disabled }) => {
  const icono = (i: number): IconName => (value >= i ? 'star' : value >= i - 0.5 ? 'star-half-full' : 'star-outline');
  if (!onChange) {
    return (
      <View style={styles.starsRow} accessibilityRole="image" accessibilityLabel={`${value.toFixed(1)} de 5 estrellas`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <MaterialCommunityIcons key={i} name={icono(i)} size={size} color={THEME.colors.accent} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.starsRow} accessibilityRole="adjustable" accessibilityLabel="Calificación" accessibilityValue={{ min: 1, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <TouchableOpacity
          key={i}
          onPress={() => onChange(i)}
          disabled={disabled}
          style={styles.starTouch}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${i} ${i === 1 ? 'estrella' : 'estrellas'}: ${starLabel(i)}`}
          accessibilityState={{ selected: value === i }}
        >
          <MaterialCommunityIcons name={value >= i ? 'star' : 'star-outline'} size={size} color={THEME.colors.accent} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

// ── Pantalla con encabezado y botón de regreso ─────────────────────────────
interface ScreenProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  headerSubtitle?: string;
}

export const Screen: React.FC<ScreenProps> = ({
  title, subtitle, onBack, backLabel = 'Volver', children, refreshing, onRefresh, headerSubtitle,
}) => (
  <ScrollView
    style={styles.container}
    contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={THEME.colors.primary} /> : undefined}
  >
    <Header subtitle={headerSubtitle ?? title} />
    <View style={styles.body}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7} accessibilityRole="button">
        <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
        <Text style={styles.backBtnText}>{backLabel}</Text>
      </TouchableOpacity>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  </ScrollView>
);

// ── Estados de carga, error y vacío ─────────────────────────────────────────
export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Cargando…' }) => (
  <View style={styles.state}>
    <ActivityIndicator color={THEME.colors.primary} />
    <Text style={styles.stateText}>{label}</Text>
  </View>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <View style={[styles.state, styles.stateError]} accessibilityRole="alert">
    <MaterialCommunityIcons name="alert-circle-outline" size={28} color={THEME.colors.error} />
    <Text style={[styles.stateText, { color: THEME.colors.error }]}>{message}</Text>
    {onRetry ? <Button label="Reintentar" icon="refresh" variant="secondary" onPress={onRetry} small /> : null}
  </View>
);

export const EmptyState: React.FC<{ icon: IconName; title: string; message?: string; action?: React.ReactNode }> = ({
  icon, title, message, action,
}) => (
  <View style={styles.state}>
    <View style={styles.emptyIcon}>
      <MaterialCommunityIcons name={icon} size={30} color={THEME.colors.primary} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {message ? <Text style={styles.stateText}>{message}</Text> : null}
    {action}
  </View>
);

// ── Botón ───────────────────────────────────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const VARIANTES = {
  primary: { bg: THEME.colors.primary, fg: THEME.colors.textInverse, border: THEME.colors.primary },
  secondary: { bg: THEME.colors.surface, fg: THEME.colors.primary, border: THEME.colors.primary },
  danger: { bg: THEME.colors.errorBg, fg: THEME.colors.error, border: THEME.colors.errorBorder },
  success: { bg: THEME.colors.success, fg: THEME.colors.textInverse, border: THEME.colors.success },
  ghost: { bg: 'transparent', fg: THEME.colors.textSecondary, border: 'transparent' },
} as const;

export const Button: React.FC<ButtonProps> = ({
  label, onPress, icon, variant = 'primary', disabled, loading, small, style, accessibilityHint,
}) => {
  const v = VARIANTES[variant];
  const inactivo = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactivo}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactivo, busy: !!loading }}
      style={[
        styles.btn, small && styles.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        inactivo && styles.btnDisabled, style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={small ? 16 : 18} color={v.fg} /> : null}
          <Text style={[styles.btnText, small && styles.btnTextSmall, { color: v.fg }]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

// ── Etiqueta de estado (con ícono: no depende solo del color) ───────────────
export type PillTone = 'neutral' | 'success' | 'warning' | 'error' | 'primary' | 'accent';
const TONOS: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: THEME.colors.surfaceAlt, fg: THEME.colors.textSecondary },
  success: { bg: THEME.colors.successBg, fg: THEME.colors.success },
  warning: { bg: THEME.colors.warningBg, fg: THEME.colors.warning },
  error: { bg: THEME.colors.errorBg, fg: THEME.colors.error },
  primary: { bg: THEME.colors.primarySoft, fg: THEME.colors.primary },
  accent: { bg: '#FDF8E8', fg: THEME.colors.accentDark },
};

export const Pill: React.FC<{ label: string; tone?: PillTone; icon?: IconName }> = ({ label, tone = 'neutral', icon }) => (
  <View style={[styles.pill, { backgroundColor: TONOS[tone].bg }]}>
    {icon ? <MaterialCommunityIcons name={icon} size={13} color={TONOS[tone].fg} /> : null}
    <Text style={[styles.pillText, { color: TONOS[tone].fg }]} numberOfLines={1}>{label}</Text>
  </View>
);

// ── Chips de filtro ─────────────────────────────────────────────────────────
export function Chips<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string; icon?: IconName; count?: number }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const activo = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.chip, activo && styles.chipActive]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
          >
            {o.icon ? <MaterialCommunityIcons name={o.icon} size={15} color={activo ? THEME.colors.textInverse : THEME.colors.primary} /> : null}
            <Text style={[styles.chipText, activo && styles.chipTextActive]}>{o.label}</Text>
            {o.count !== undefined && o.count > 0 ? (
              <View style={[styles.chipCount, activo && styles.chipCountActive]}>
                <Text style={[styles.chipCountText, activo && styles.chipCountTextActive]}>{o.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Tarjeta ─────────────────────────────────────────────────────────────────
export const Card: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'default' | 'warning' }> = ({
  children, style, tone = 'default',
}) => <View style={[styles.card, tone === 'warning' && styles.cardWarning, style]}>{children}</View>;

// ── Hoja modal (ventana emergente) ──────────────────────────────────────────
interface SheetProps {
  visible: boolean;
  title: string;
  icon?: IconName;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeDisabled?: boolean;
}

export const Sheet: React.FC<SheetProps> = ({ visible, title, icon, onClose, children, footer, closeDisabled }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!closeDisabled) onClose(); }}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.sheetHeader}>
          {icon ? (
            <View style={styles.sheetIcon}>
              <MaterialCommunityIcons name={icon} size={20} color={THEME.colors.primary} />
            </View>
          ) : null}
          <Text style={styles.sheetTitle} accessibilityRole="header" numberOfLines={2}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            disabled={closeDisabled}
            style={styles.sheetClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <MaterialCommunityIcons name="close" size={22} color={THEME.colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetBodyContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

// ── Formato ─────────────────────────────────────────────────────────────────
export const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  content: { paddingBottom: 48 },
  body: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, minHeight: 44 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: THEME.colors.primary },
  title: { fontSize: 22, fontWeight: '900', color: THEME.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: THEME.colors.textSecondary, marginBottom: 16, lineHeight: 20 },

  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  starTouch: { padding: 4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },

  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 10 },
  stateError: { backgroundColor: THEME.colors.errorBg, borderRadius: THEME.borderRadius.lg, borderWidth: 1, borderColor: THEME.colors.errorBorder },
  stateText: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: THEME.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: THEME.colors.textPrimary, textAlign: 'center' },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 18, borderRadius: THEME.borderRadius.md, borderWidth: 1.5 },
  btnSmall: { minHeight: 40, paddingHorizontal: 12 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 15, fontWeight: '800' },
  btnTextSmall: { fontSize: 13 },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: THEME.borderRadius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '800' },

  chips: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: THEME.borderRadius.pill, borderWidth: 1.5, borderColor: THEME.colors.primary, backgroundColor: THEME.colors.surface },
  chipActive: { backgroundColor: THEME.colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: THEME.colors.primary },
  chipTextActive: { color: THEME.colors.textInverse },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: THEME.colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chipCountActive: { backgroundColor: THEME.colors.accentLight },
  chipCountText: { fontSize: 11, fontWeight: '900', color: THEME.colors.textInverse },
  chipCountTextActive: { color: THEME.colors.primaryDark },

  card: { backgroundColor: THEME.colors.surface, borderRadius: THEME.borderRadius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: THEME.colors.border, ...THEME.shadows.card },
  cardWarning: { backgroundColor: THEME.colors.warningBg, borderColor: THEME.colors.warningBorder },

  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92%', backgroundColor: THEME.colors.surface, borderRadius: THEME.borderRadius.xl, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  sheetIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '900', color: THEME.colors.textPrimary },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { flexGrow: 0 },
  sheetBodyContent: { padding: 18, gap: 12 },
  sheetFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: THEME.colors.border, flexWrap: 'wrap' },

  label: { fontSize: 13, fontWeight: '800', color: THEME.colors.textPrimary },
  muted: { fontSize: 13, color: THEME.colors.textSecondary, lineHeight: 19 },
  small: { fontSize: 12, color: THEME.colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldError: { fontSize: 12, fontWeight: '600', color: THEME.colors.error, marginTop: 4 },
  textArea: {
    minHeight: 96, borderWidth: 1.5, borderColor: THEME.colors.border, borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt, padding: 12, fontSize: 15, color: THEME.colors.textPrimary, textAlignVertical: 'top',
  },
  textAreaError: { borderColor: THEME.colors.error, backgroundColor: THEME.colors.errorBg },
  input: {
    minHeight: 48, borderWidth: 1.5, borderColor: THEME.colors.border, borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt, paddingHorizontal: 12, fontSize: 15, color: THEME.colors.textPrimary,
  },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: THEME.borderRadius.md, backgroundColor: '#FDF8E8', borderWidth: 1, borderColor: THEME.colors.accentLight, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 13, color: THEME.colors.textPrimary, lineHeight: 19 },
});
