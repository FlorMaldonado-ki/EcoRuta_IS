import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AttachedFile } from '../types/registration';
import { THEME } from '../constants/theme';

interface DocumentPickerFieldProps {
  label: string;
  sublabel: string;
  instructions: string;
  file: AttachedFile | null;
  onFileSelect: (file: AttachedFile | null) => void;
  error?: string;
  /** @deprecated Ya no se usa: el archivo de prueba simulado no se puede subir a la API. */
  sampleFileName?: string;
}

export const DocumentPickerField: React.FC<DocumentPickerFieldProps> = ({
  label,
  sublabel,
  instructions,
  file,
  onFileSelect,
  error,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return 'Tamaño no disponible';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handlePickDocument = async () => {
    try {
      setIsLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        // Mismos formatos que acepta la API y la BD (ck_documento_mime): PDF, PNG, JPG.
        type: ['application/pdf', 'image/png', 'image/jpeg'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        onFileSelect({
          name: asset.name,
          size: asset.size,
          uri: asset.uri,
          mimeType: asset.mimeType,
          lastModified: asset.lastModified,
          webFile: Platform.OS === 'web' ? asset.file : undefined,
        });
      }
    } catch (err) {
      console.warn('Error al seleccionar documento:', err);
      // Fallback para entornos donde el selector falle o se cancele con excepción
      Alert.alert(
        'Aviso',
        'No se pudo abrir el selector de archivos del dispositivo. Intenta nuevamente.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    onFileSelect(null);
  };

  const getFileIcon = (name: string): keyof typeof MaterialCommunityIcons.glyphMap => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'file-pdf-box';
    if (['png', 'jpg', 'jpeg'].includes(ext || '')) return 'file-image';
    if (['doc', 'docx'].includes(ext || '')) return 'file-word';
    return 'file-document-outline';
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <MaterialCommunityIcons name="paperclip" size={18} color={THEME.colors.primary} />
          <Text style={styles.label}>
            {label} <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <Text style={styles.mandatoryBadge}>Obligatorio</Text>
      </View>
      <Text style={styles.sublabel}>{sublabel}</Text>

      <View style={styles.instructionsBox}>
        <MaterialCommunityIcons
          name="information-outline"
          size={16}
          color={THEME.colors.accentDark}
          style={styles.infoIcon}
        />
        <Text style={styles.instructionsText}>{instructions}</Text>
      </View>

      {!file ? (
        <View
          style={[
            styles.dropzoneContainer,
            error ? styles.dropzoneError : undefined,
          ]}
        >
          <View style={styles.dropzoneIconWrapper}>
            <MaterialCommunityIcons
              name="cloud-upload-outline"
              size={32}
              color={error ? THEME.colors.error : THEME.colors.primary}
            />
          </View>

          <Text style={styles.dropzoneTitle}>Adjunta tu documento institucional</Text>
          <Text style={styles.dropzoneSubtitle}>
            Formatos soportados: PDF, PNG, JPG (Máx. 10 MB)
          </Text>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={handlePickDocument}
              disabled={isLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Seleccionar archivo para ${label}`}
            >
              {isLoading ? (
                <ActivityIndicator color={THEME.colors.textInverse} size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="folder-open-outline"
                    size={18}
                    color={THEME.colors.textInverse}
                  />
                  <Text style={styles.uploadBtnText}>Seleccionar archivo</Text>
                </>
              )}
            </TouchableOpacity>

          </View>
        </View>
      ) : (
        /* Vista cuando SÍ hay archivo adjunto */
        <View style={styles.fileCard}>
          <View style={styles.fileCardContent}>
            <View style={styles.fileTypeBadge}>
              <MaterialCommunityIcons
                name={getFileIcon(file.name)}
                size={28}
                color={THEME.colors.primary}
              />
            </View>

            <View style={styles.fileInfo}>
              <View style={styles.fileNameRow}>
                <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
                  {file.name}
                </Text>
              </View>

              <View style={styles.fileMetaRow}>
                <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                <View style={styles.dotSeparator} />
                <View style={styles.verifiedTag}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={13}
                    color={THEME.colors.success}
                  />
                  <Text style={styles.verifiedTagText}>Listo para enviar</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.fileCardActions}>
            <TouchableOpacity
              style={styles.replaceBtn}
              onPress={handlePickDocument}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Reemplazar archivo adjunto"
            >
              <MaterialCommunityIcons
                name="cached"
                size={16}
                color={THEME.colors.primary}
              />
              <Text style={styles.replaceBtnText}>Reemplazar archivo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.removeBtn}
              onPress={handleRemove}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Quitar archivo adjunto"
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={16}
                color={THEME.colors.error}
              />
              <Text style={styles.removeBtnText}>Quitar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={15} color={THEME.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  required: {
    color: THEME.colors.error,
  },
  mandatoryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.primaryDark,
    backgroundColor: THEME.colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    textTransform: 'uppercase',
  },
  sublabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 8,
  },
  instructionsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: THEME.colors.warningBg,
    borderColor: 'rgba(197, 155, 39, 0.4)',
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  infoIcon: {
    marginTop: 2,
  },
  instructionsText: {
    fontSize: 12,
    color: '#78350F',
    flex: 1,
    lineHeight: 16,
  },
  dropzoneContainer: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: THEME.colors.borderSubtle,
    borderRadius: THEME.borderRadius.lg,
    backgroundColor: THEME.colors.surface,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropzoneError: {
    borderColor: THEME.colors.error,
    backgroundColor: THEME.colors.errorBg,
  },
  dropzoneIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dropzoneTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  dropzoneSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 14,
    textAlign: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: THEME.borderRadius.md,
    gap: 8,
    ...THEME.shadows.card,
  },
  uploadBtnText: {
    color: THEME.colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  sampleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 6,
  },
  sampleBtnText: {
    color: THEME.colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  fileCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderSubtle,
    padding: 14,
    ...THEME.shadows.card,
  },
  fileCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  fileTypeBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(107, 23, 54, 0.15)',
  },
  fileInfo: {
    flex: 1,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  fileSize: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  dotSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.colors.textMuted,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.success,
  },
  fileCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.primarySoft,
  },
  replaceBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.primary,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: THEME.borderRadius.sm,
    backgroundColor: THEME.colors.errorBg,
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.error,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.error,
    fontWeight: '500',
  },
});
