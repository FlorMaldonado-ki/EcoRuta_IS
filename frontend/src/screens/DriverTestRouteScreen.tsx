import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InteractiveMap } from '../components/InteractiveMap';
import { InputField } from '../components/InputField';
import { THEME } from '../constants/theme';
import { updateRouteMeetingPoints, getDriverRoute } from '../services/tripStorage';
import type { DriverRoute, MeetingPoint, UserDTO } from '../types/api';

interface DriverTestRouteScreenProps {
  currentUser: UserDTO;
  route: DriverRoute;
  onBack: () => void;
  onSuccessFinished: () => void;
}

export const DriverTestRouteScreen: React.FC<DriverTestRouteScreenProps> = ({
  currentUser,
  route: initialRoute,
  onBack,
  onSuccessFinished,
}) => {
  const currentRoute = getDriverRoute() || initialRoute;
  const [meetingPoints, setMeetingPoints] = useState<MeetingPoint[]>(
    currentRoute.meetingPoints || []
  );

  // Estados del modal de agregar/editar punto
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pointName, setPointName] = useState('');
  const [pointDesc, setPointDesc] = useState('');
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Estado de éxito al guardar
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Manejar toque en el mapa
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setSelectedCoords(coords);
    setEditingPointId(null);
    setPointName('');
    setPointDesc('');
    setFormError(null);
    setModalVisible(true);
  };

  // Abrir modal en modo edición
  const handleEditPoint = (mp: MeetingPoint) => {
    setSelectedCoords({ lat: mp.lat, lng: mp.lng });
    setEditingPointId(mp.id);
    setPointName(mp.name);
    setPointDesc(mp.description || '');
    setFormError(null);
    setModalVisible(true);
  };

  // Guardar punto desde el modal
  const handleSaveModalPoint = () => {
    if (!pointName.trim()) {
      setFormError('Por favor ingresa un nombre para el punto de encuentro.');
      return;
    }

    if (!selectedCoords) {
      setFormError('No se han determinado las coordenadas del punto.');
      return;
    }

    if (editingPointId) {
      // Modo edición
      setMeetingPoints((prev) =>
        prev.map((p) =>
          p.id === editingPointId
            ? {
                ...p,
                name: pointName.trim(),
                description: pointDesc.trim() || undefined,
                lat: selectedCoords.lat,
                lng: selectedCoords.lng,
              }
            : p
        )
      );
    } else {
      // Modo creación nuevo
      const newPoint: MeetingPoint = {
        id: `mp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: pointName.trim(),
        description: pointDesc.trim() || undefined,
        lat: selectedCoords.lat,
        lng: selectedCoords.lng,
        order: meetingPoints.length + 1,
      };
      setMeetingPoints((prev) => [...prev, newPoint]);
    }

    setModalVisible(false);
  };

  // Eliminar punto
  const handleDeletePoint = (id: string) => {
    setMeetingPoints((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      // Reasignar orden secuencial 1, 2, 3...
      return filtered.map((p, index) => ({ ...p, order: index + 1 }));
    });
  };

  // Subir punto de orden
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setMeetingPoints((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy.map((p, i) => ({ ...p, order: i + 1 }));
    });
  };

  // Bajar punto de orden
  const handleMoveDown = (index: number) => {
    if (index === meetingPoints.length - 1) return;
    setMeetingPoints((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy.map((p, i) => ({ ...p, order: i + 1 }));
    });
  };

  // Guardar configuración final de la ruta (Sin validaciones administrativas ni exámenes)
  const handleSaveRoute = () => {
    updateRouteMeetingPoints(meetingPoints);
    setShowSuccessModal(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="Ruta de Prueba · Puntos de Encuentro" />

      <View style={styles.body}>
        {/* Barra superior */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backBtnText}>Volver a Configuración</Text>
        </TouchableOpacity>

        {/* Resumen de trayecto */}
        <View style={styles.routeHeaderCard}>
          <View style={styles.routeHeaderRow}>
            <MaterialCommunityIcons name="map-marker-path" size={24} color={THEME.colors.primary} />
            <Text style={styles.routeHeaderTitle}>
              {currentRoute.direction === 'to_campus' ? 'Ruta hacia el Tec' : 'Ruta desde el Tec'}
            </Text>
          </View>
          <View style={styles.pointsSummaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Origen (A)</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {currentRoute.origin.text}
              </Text>
            </View>
            <MaterialCommunityIcons name="arrow-right-bold" size={18} color={THEME.colors.accent} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Destino (B)</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {currentRoute.destination.text}
              </Text>
            </View>
          </View>
        </View>

        {/* Instrucción directa */}
        <View style={styles.instructionBanner}>
          <MaterialCommunityIcons name="gesture-tap" size={22} color={THEME.colors.primary} />
          <Text style={styles.instructionText}>
            <Text style={{ fontWeight: '800' }}>Toca en el mapa</Text> los lugares donde puedes recoger o dejar pasajeros a lo largo de tu recorrido.
          </Text>
        </View>

        {/* Mapa interactivo con modo 'edit_meeting_points' */}
        <View style={styles.mapContainer}>
          <InteractiveMap
            origin={currentRoute.origin}
            destination={currentRoute.destination}
            meetingPoints={meetingPoints}
            mode="edit_meeting_points"
            onMapClick={handleMapClick}
            height={360}
          />
        </View>

        {/* Lista de Puntos de Encuentro configurados */}
        <View style={styles.listCard}>
          <View style={styles.listCardHeader}>
            <View style={styles.listTitleRow}>
              <MaterialCommunityIcons name="format-list-numbered" size={20} color={THEME.colors.primary} />
              <Text style={styles.listTitle}>
                Puntos de encuentro ({meetingPoints.length})
              </Text>
            </View>
            <Text style={styles.listSubtitle}>
              {meetingPoints.length === 0
                ? 'Ningún punto seleccionado aún.'
                : 'Reordena o elimina según el trayecto.'}
            </Text>
          </View>

          {meetingPoints.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="map-marker-question-outline"
                size={40}
                color={THEME.colors.textMuted}
              />
              <Text style={styles.emptyStateText}>
                Toca cualquier calle o avenida en el mapa arriba para agregar una parada intermedia.
              </Text>
            </View>
          ) : (
            meetingPoints.map((mp, index) => (
              <View key={mp.id} style={styles.pointItem}>
                {/* Número de parada */}
                <View style={styles.badgeCircle}>
                  <Text style={styles.badgeNumber}>{mp.order || index + 1}</Text>
                </View>

                {/* Datos del punto */}
                <View style={styles.pointInfo}>
                  <Text style={styles.pointName}>{mp.name}</Text>
                  {mp.description ? (
                    <Text style={styles.pointDesc}>{mp.description}</Text>
                  ) : null}
                  <Text style={styles.pointCoords}>
                    📍 {mp.lat.toFixed(5)}, {mp.lng.toFixed(5)}
                  </Text>
                </View>

                {/* Acciones de reordenamiento y borrado */}
                <View style={styles.pointActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, index === 0 && styles.actionBtnDisabled]}
                    onPress={() => handleMoveUp(index)}
                    disabled={index === 0}
                    accessibilityLabel="Mover arriba"
                  >
                    <MaterialCommunityIcons
                      name="arrow-up-bold"
                      size={18}
                      color={index === 0 ? THEME.colors.border : THEME.colors.primary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      index === meetingPoints.length - 1 && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleMoveDown(index)}
                    disabled={index === meetingPoints.length - 1}
                    accessibilityLabel="Mover abajo"
                  >
                    <MaterialCommunityIcons
                      name="arrow-down-bold"
                      size={18}
                      color={
                        index === meetingPoints.length - 1
                          ? THEME.colors.border
                          : THEME.colors.primary
                      }
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleEditPoint(mp)}
                    accessibilityLabel="Editar punto"
                  >
                    <MaterialCommunityIcons name="pencil" size={18} color={THEME.colors.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDeletePoint(mp.id)}
                    accessibilityLabel="Eliminar punto"
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={THEME.colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Botón de Guardar Ruta (Sin validaciones administrativas ni exámenes externos) */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSaveRoute}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="check-decagram" size={22} color={THEME.colors.textInverse} />
          <Text style={styles.saveBtnText}>Guardar Puntos de Encuentro</Text>
        </TouchableOpacity>
      </View>

      {/* Modal para ingresar/editar Nombre de punto de encuentro */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="map-marker-plus" size={24} color={THEME.colors.primary} />
              <Text style={styles.modalTitle}>
                {editingPointId ? 'Editar Punto de Encuentro' : 'Nuevo Punto de Encuentro'}
              </Text>
            </View>

            {selectedCoords && (
              <View style={styles.coordsBadge}>
                <Text style={styles.coordsText}>
                  Coordenadas capturadas: {selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}
                </Text>
              </View>
            )}

            {formError && (
              <Text style={styles.modalError}>{formError}</Text>
            )}

            <InputField
              label="Nombre del punto o referencia"
              value={pointName}
              onChangeText={setPointName}
              placeholder="Ej. Gasolinera Poza Rica / Oxxo Camelinas"
              iconName="map-marker-outline"
            />

            <InputField
              label="Indicación para el pasajero (Opcional)"
              value={pointDesc}
              onChangeText={setPointDesc}
              required={false}
              placeholder="Ej. Esperar bajo el puente peatonal"
              iconName="comment-text-outline"
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleSaveModalPoint}
              >
                <Text style={styles.modalConfirmBtnText}>
                  {editingPointId ? 'Guardar Cambios' : 'Agregar Punto'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Éxito al configurar la ruta */}
      <Modal visible={showSuccessModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconCircle}>
              <MaterialCommunityIcons name="check" size={40} color={THEME.colors.textInverse} />
            </View>

            <Text style={styles.successTitle}>¡Ruta Configurada!</Text>
            <Text style={styles.successMessage}>
              Tus puntos de encuentro han sido guardados exitosamente. Ahora tu perfil de conductor cuenta con una ruta activa lista para publicar viajes compartidos.
            </Text>

            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={() => {
                setShowSuccessModal(false);
                onSuccessFinished();
              }}
            >
              <Text style={styles.modalConfirmBtnText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  body: {
    padding: 16,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  routeHeaderCard: {
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 12,
    ...THEME.shadows.card,
  },
  routeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  routeHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  pointsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 12,
    borderRadius: THEME.borderRadius.md,
    gap: 8,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  instructionBanner: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(107, 23, 54, 0.2)',
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 12,
    color: THEME.colors.primary,
    flex: 1,
    lineHeight: 17,
  },
  mapContainer: {
    borderRadius: THEME.borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 16,
    ...THEME.shadows.card,
  },
  listCard: {
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 16,
    ...THEME.shadows.card,
  },
  listCardHeader: {
    marginBottom: 12,
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  listSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  pointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 12,
    borderRadius: THEME.borderRadius.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 12,
  },
  badgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  pointInfo: {
    flex: 1,
  },
  pointName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  pointDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  pointCoords: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  pointActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.md,
    height: 52,
    gap: 10,
    marginTop: 4,
    ...THEME.shadows.hover,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.xl,
    padding: 24,
    maxWidth: 440,
    width: '100%',
    ...THEME.shadows.hover,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  coordsBadge: {
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 8,
    borderRadius: THEME.borderRadius.sm,
    marginBottom: 12,
  },
  coordsText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontFamily: 'monospace',
  },
  modalError: {
    fontSize: 12,
    color: THEME.colors.error,
    marginBottom: 8,
    fontWeight: '600',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1.4,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.primary,
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
  successIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: THEME.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
});
