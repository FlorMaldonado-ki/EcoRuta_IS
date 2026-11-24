/**
 * Alerta destacada en la parte superior de cualquier pantalla (tarjeta blanca con acento de color).
 *  - critical (cancelaciones, rechazos): acento rojo, fondo oscurecido, icono con anillo
 *    pulsante y vibración de error. NO se cierra sola.
 *  - trip / success / info / warning: barra de tiempo y cierre automático a los 6 s.
 * El botón principal lleva a la sección del aviso (Mis viajes, Solicitudes, Buscar viajes).
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { SECTION_LABEL, TONE_META } from '../constants/notificationMeta';
import { useNotifications } from '../hooks/useNotifications';

const AUTO_DISMISS_MS = 6_000;

export const AlertBanner: React.FC = () => {
  const { currentAlert, pendingAlerts, dismissAlert, goToSection, openCenter } = useNotifications();
  const [slide] = useState(() => new Animated.Value(-260));
  const [ring] = useState(() => new Animated.Value(0));
  const [timer] = useState(() => new Animated.Value(1));
  const isCritical = currentAlert?.tone === 'critical';
  // Las de atención (viaje lleno, errores) tampoco se cierran solas, pero sin oscurecer la pantalla.
  const persistent = isCritical || currentAlert?.tone === 'warning';

  // Entrada deslizándose desde arriba cada vez que cambia la alerta.
  useEffect(() => {
    if (!currentAlert) return;
    slide.setValue(-260);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 7 }).start();
  }, [currentAlert, slide]);

  // Anillo pulsante alrededor del icono en las críticas.
  useEffect(() => {
    if (!isCritical) return;
    ring.setValue(0);
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [isCritical, currentAlert, ring]);

  // Barra de tiempo + cierre automático en las no críticas.
  useEffect(() => {
    if (!currentAlert || persistent) return;
    timer.setValue(1);
    const anim = Animated.timing(timer, { toValue: 0, duration: AUTO_DISMISS_MS, easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => finished && dismissAlert());
    return () => anim.stop();
  }, [currentAlert, persistent, dismissAlert, timer]);

  if (!currentAlert) return null;
  const tone = TONE_META[currentAlert.tone];
  const icon = (currentAlert.icon as keyof typeof MaterialCommunityIcons.glyphMap) || tone.icon;
  const section = currentAlert.section;

  const handleView = () => {
    dismissAlert();
    if (section) goToSection(section);
    else openCenter();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {isCritical && <View style={styles.backdrop} />}

      <Animated.View
        style={[styles.card, isCritical && { borderColor: tone.color, borderWidth: 1.5 }, { transform: [{ translateY: slide }] }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <View style={[styles.accent, { backgroundColor: tone.color }]} />

        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              {isCritical && (
                <Animated.View
                  style={[
                    styles.iconRing,
                    { borderColor: tone.color },
                    {
                      opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                      transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                    },
                  ]}
                />
              )}
              <View style={[styles.iconBubble, { backgroundColor: tone.color }]}>
                <MaterialCommunityIcons name={icon} size={22} color="#FFFFFF" />
              </View>
            </View>

            <View style={styles.texts}>
              <View style={styles.metaRow}>
                <View style={[styles.chip, { backgroundColor: tone.tint }]}>
                  <Text style={[styles.chipText, { color: tone.color }]}>{tone.label}</Text>
                </View>
                <Text style={styles.when}>Ahora</Text>
                {pendingAlerts > 0 && (
                  <View style={styles.pending}>
                    <Text style={styles.pendingText}>+{pendingAlerts}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.title, isCritical && { color: tone.color }]}>{currentAlert.title}</Text>
              <Text style={styles.message}>{currentAlert.message}</Text>
            </View>

            <TouchableOpacity onPress={dismissAlert} style={styles.close} hitSlop={10} accessibilityLabel="Cerrar aviso">
              <MaterialCommunityIcons name="close" size={18} color={THEME.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            {persistent && (
              <TouchableOpacity style={styles.btnGhost} onPress={dismissAlert} activeOpacity={0.8}>
                <Text style={styles.btnGhostText}>Entendido</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tone.color }]} onPress={handleView} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>{section ? `Ir a ${SECTION_LABEL[section]}` : 'Ver avisos'}</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {!persistent && (
          <Animated.View
            style={[
              styles.timerBar,
              { backgroundColor: tone.color, width: timer.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(79, 15, 39, 0.45)', // guinda oscuro translúcido
  },
  card: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: 'hidden',
    shadowColor: THEME.colors.primaryDark,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  accent: {
    width: 5,
  },
  body: {
    flex: 1,
    padding: 14,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
  },
  iconRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  chip: {
    borderRadius: THEME.borderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  when: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  pending: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  pendingText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    color: THEME.colors.textSecondary,
  },
  close: {
    padding: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  btnGhost: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.md,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  timerBar: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    opacity: 0.6,
  },
});
