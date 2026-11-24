import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { EXTENDED_COLOR_PALETTE } from '../constants/options';

interface ColorPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onColorSelect: (colorHex: string, colorName: string) => void;
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  visible,
  onClose,
  onColorSelect,
}) => {
  const [selectedHex, setSelectedHex] = useState(EXTENDED_COLOR_PALETTE[0]);

  const handleConfirm = () => {
    onColorSelect(selectedHex, `Personalizado (${selectedHex})`);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.cardContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Selecciona el color del vehículo</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={THEME.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.previewBox}>
              <View style={[styles.previewColor, { backgroundColor: selectedHex }]} />
              <View>
                <Text style={styles.previewLabel}>Color seleccionado:</Text>
                <Text style={styles.previewHex}>{selectedHex.toUpperCase()}</Text>
              </View>
            </View>

            <Text style={styles.paletteTitle}>Paleta de colores:</Text>
            <View style={styles.paletteGrid}>
              {EXTENDED_COLOR_PALETTE.map((hex) => {
                const isSelected = selectedHex === hex;
                return (
                  <TouchableOpacity
                    key={hex}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: hex },
                      isSelected && styles.colorSwatchSelected,
                    ]}
                    onPress={() => setSelectedHex(hex)}
                    activeOpacity={0.8}
                  >
                    {isSelected && (
                      <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmBtnText}>Confirmar Color</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    ...THEME.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 12,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 20,
  },
  previewColor: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  previewLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  previewHex: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  paletteTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 12,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 24,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: THEME.colors.primary,
    transform: [{ scale: 1.15 }],
  },
  confirmBtn: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 12,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

