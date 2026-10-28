import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  SafeAreaView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';

interface SelectModalFieldProps {
  label: string;
  required?: boolean;
  value: string;
  placeholder?: string;
  options: readonly string[];
  onSelect: (value: string) => void;
  error?: string;
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
}

export const SelectModalField: React.FC<SelectModalFieldProps> = ({
  label,
  required = true,
  value,
  placeholder = 'Selecciona una opción...',
  options,
  onSelect,
  error,
  iconName = 'format-list-bulleted',
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = options.filter((item) =>
    item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChoose = (item: string) => {
    onSelect(item);
    setModalVisible(false);
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label} {required && <Text style={styles.required}>*</Text>}
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.selectorButton,
          error ? styles.selectorError : undefined,
          value ? styles.selectorActive : undefined,
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
        accessibilityRole="combobox"
        accessibilityLabel={`${label}: ${value || 'no seleccionado'}`}
      >
        <View style={styles.buttonLeft}>
          <MaterialCommunityIcons
            name={iconName}
            size={20}
            color={value ? THEME.colors.primary : THEME.colors.textMuted}
            style={styles.leftIcon}
          />
          <Text
            style={[styles.valueText, !value && styles.placeholderText]}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-down"
          size={20}
          color={THEME.colors.textSecondary}
        />
      </TouchableOpacity>

      {error ? (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={THEME.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleBox}>
                <MaterialCommunityIcons name={iconName} size={22} color={THEME.colors.primary} />
                <Text style={styles.modalTitle}>{label}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <MaterialCommunityIcons name="close" size={22} color={THEME.colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={THEME.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar opción..."
                placeholderTextColor={THEME.colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelected = item === value;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                    onPress={() => handleChoose(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.optionItemText,
                        isSelected && styles.optionItemTextSelected,
                      ]}
                    >
                      {item}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={20}
                        color={THEME.colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No se encontraron resultados</Text>
                </View>
              }
            />
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  required: {
    color: THEME.colors.error,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.md,
    height: 50,
    paddingHorizontal: 12,
  },
  selectorActive: {
    borderColor: THEME.colors.borderSubtle,
  },
  selectorError: {
    borderColor: THEME.colors.error,
    backgroundColor: THEME.colors.errorBg,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  leftIcon: {
    marginRight: 10,
  },
  valueText: {
    fontSize: 14,
    color: THEME.colors.textPrimary,
    flex: 1,
  },
  placeholderText: {
    color: THEME.colors.textMuted,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    paddingHorizontal: 2,
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.error,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  modalHeaderTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: THEME.colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.sm,
  },
  optionItemSelected: {
    backgroundColor: THEME.colors.primarySoft,
  },
  optionItemText: {
    fontSize: 14,
    color: THEME.colors.textPrimary,
    flex: 1,
    marginRight: 10,
  },
  optionItemTextSelected: {
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: THEME.colors.textMuted,
    fontSize: 14,
  },
});
