import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InputField } from '../components/InputField';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { ColorPickerModal } from '../components/ColorPickerModal';
import { DocumentPickerField } from '../components/DocumentPickerField';
import { THEME } from '../constants/theme';
import { COMMON_VEHICLE_COLORS } from '../constants/options';
import {
  saveDriverPhoto,
  getDriverPhoto,
  saveDriverVehicle,
  getDriverVehicle,
} from '../services/tripStorage';
import type { UserDTO, VehicleDTO } from '../types/api';
import type { AttachedFile } from '../types/registration';

interface DriverProfileVehicleScreenProps {
  currentUser: UserDTO;
  onBack: () => void;
  onSuccessNavigateToRoute: () => void;
}

export const DriverProfileVehicleScreen: React.FC<DriverProfileVehicleScreenProps> = ({
  currentUser,
  onBack,
  onSuccessNavigateToRoute,
}) => {
  // Estados de foto de conductor
  const [photoUrl, setPhotoUrl] = useState<string | null>(getDriverPhoto() || currentUser.photoUrl || null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Estados de datos de vehículo
  const existingVehicle = getDriverVehicle();
  const [brand, setBrand] = useState(existingVehicle?.brand || '');
  const [model, setModel] = useState(existingVehicle?.model || '');
  const [selectedColor, setSelectedColor] = useState(existingVehicle?.color || COMMON_VEHICLE_COLORS[0].name);
  const [showCustomColorModal, setShowCustomColorModal] = useState(false);
  const [plates, setPlacas] = useState(existingVehicle?.plates || '');
  const [capacity, setCapacity] = useState(existingVehicle ? existingVehicle.capacity.toString() : '4');
  const [declarationAccepted, setDeclarationAccepted] = useState(existingVehicle?.declarationLicenseInsurance ?? false);
  const [circulationDoc, setCirculationDoc] = useState<AttachedFile | null>(existingVehicle?.circulationDoc || null);

  // Errores
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handlePhotoCaptured = (capturedDataUrl: string) => {
    setPhotoUrl(capturedDataUrl);
    setPhotoError(null);
    saveDriverPhoto(capturedDataUrl);
  };

  const validate = (): boolean => {
    const err: Record<string, string> = {};

    // 1. Fotografía obligatoria desde cámara
    if (!photoUrl) {
      err.photo = 'Es obligatorio capturar tu fotografía en vivo desde la cámara de la aplicación.';
      setPhotoError(err.photo);
    } else {
      setPhotoError(null);
    }

    // 2. Marca y modelo
    if (!brand.trim()) err.brand = 'Ingresa la marca del vehículo (ej. Nissan, VW, Chevrolet).';
    if (!model.trim()) err.model = 'Ingresa el modelo y año (ej. Versa 2022).';

    // 3. Placas
    const cleanPlates = plates.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanPlates) {
      err.plates = 'Las placas del vehículo son obligatorias.';
    } else if (cleanPlates.length < 5 || cleanPlates.length > 10) {
      err.plates = 'Formato de placas no válido (entre 5 y 10 caracteres).';
    }

    // 4. Capacidad
    const capNum = parseInt(capacity, 10);
    if (isNaN(capNum) || capNum < 2 || capNum > 8) {
      err.capacity = 'La capacidad debe ser entre 2 y 8 ocupantes (incluyendo conductor).';
    }

    // 5. Declaración de seguro y licencia (RN-12)
    if (!declarationAccepted) {
      err.declaration = 'Debes declarar bajo protesta de decir verdad que cuentas con licencia y seguro vigentes.';
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveAndContinue = () => {
    if (!validate()) {
      Alert.alert('Datos incompletos', 'Por favor revisa los campos señalados antes de continuar.');
      return;
    }

    const vehicleData: VehicleDTO = {
      id: existingVehicle?.id || `veh-${Date.now()}`,
      brand: brand.trim(),
      model: model.trim(),
      color: selectedColor,
      plates: plates.trim().toUpperCase(),
      capacity: parseInt(capacity, 10),
      active: true,
      declarationLicenseInsurance: declarationAccepted,
      circulationDoc,
    };

    saveDriverVehicle(vehicleData);
    if (photoUrl) {
      saveDriverPhoto(photoUrl);
    }

    Alert.alert(
      '¡Vehículo y Conductor Registrados!',
      'Tu información fue guardada correctamente. Ahora configuremos tu ruta habitual para poder publicar viajes.',
      [
        {
          text: 'Continuar a Registro de Ruta',
          onPress: onSuccessNavigateToRoute,
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="Registro de Conductor y Vehículo" />

      {/* Navegación superior */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backButtonText}>Regresar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainCard}>
        <Text style={styles.title}>Perfil de Conductor</Text>
        <Text style={styles.subtitle}>
          Para ofrecer viajes a la comunidad estudiantil y docente, requerimos validar tu identidad y los datos de tu vehículo.
        </Text>

        {/* SECCIÓN 1: FOTOGRAFÍA OBLIGATORIA CON CÁMARA */}
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionDividerText}>1. Fotografía de Identidad (Obligatoria)</Text>
        </View>

        <View style={styles.cameraSection}>
          <Text style={styles.cameraInstructions}>
            Por seguridad, la fotografía debe tomarse **directamente con la cámara** de la app. No se permite seleccionar imágenes de la galería.
          </Text>

          <View style={styles.photoContainer}>
            {photoUrl ? (
              <View style={styles.photoPreviewWrapper}>
                <Image source={{ uri: photoUrl }} style={styles.capturedImage} />
                <View style={styles.photoBadge}>
                  <MaterialCommunityIcons name="check-circle" size={18} color={THEME.colors.success} />
                  <Text style={styles.photoBadgeText}>Capturada en vivo</Text>
                </View>
              </View>
            ) : (
              <View style={styles.noPhotoPlaceholder}>
                <MaterialCommunityIcons name="camera-plus-outline" size={48} color={THEME.colors.primary} />
                <Text style={styles.noPhotoText}>Sin fotografía capturada</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.openCameraBtn}
              onPress={() => setShowCameraModal(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="camera" size={20} color="#FFFFFF" />
              <Text style={styles.openCameraBtnText}>
                {photoUrl ? 'Repetir fotografía con cámara' : 'Abrir cámara y tomar foto'}
              </Text>
            </TouchableOpacity>

            {photoError && <Text style={styles.errorText}>{photoError}</Text>}
          </View>
        </View>

        {/* SECCIÓN 2: DATOS DEL VEHÍCULO */}
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionDividerText}>2. Información del Vehículo</Text>
        </View>

        <InputField
          label="Marca del vehículo"
          placeholder="Ej. Nissan, Volkswagen, Chevrolet"
          iconName="car"
          value={brand}
          onChangeText={(txt) => {
            setBrand(txt);
            if (errors.brand) setErrors((prev) => ({ ...prev, brand: '' }));
          }}
          error={errors.brand}
        />

        <InputField
          label="Modelo y año"
          placeholder="Ej. Versa 2022, Jetta 2020"
          iconName="car-info"
          value={model}
          onChangeText={(txt) => {
            setModel(txt);
            if (errors.model) setErrors((prev) => ({ ...prev, model: '' }));
          }}
          error={errors.model}
        />

        {/* Selector de Color */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>Color del vehículo *</Text>
          <Text style={styles.fieldSublabel}>Selecciona el color predominante de la carrocería</Text>

          <View style={styles.colorPaletteRow}>
            {COMMON_VEHICLE_COLORS.map((c) => {
              const isSelected = selectedColor === c.name;
              return (
                <TouchableOpacity
                  key={c.name}
                  style={[
                    styles.colorChip,
                    isSelected && styles.colorChipSelected,
                  ]}
                  onPress={() => setSelectedColor(c.name)}
                >
                  <View style={[styles.colorCircle, { backgroundColor: c.hex, borderColor: c.border }]} />
                  <Text style={[styles.colorName, isSelected && styles.colorNameSelected]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Opción 'Otro' con selector visual */}
            <TouchableOpacity
              style={[
                styles.colorChip,
                selectedColor.startsWith('Personalizado') && styles.colorChipSelected,
              ]}
              onPress={() => setShowCustomColorModal(true)}
            >
              <MaterialCommunityIcons name="palette" size={18} color={THEME.colors.primary} />
              <Text style={[styles.colorName, selectedColor.startsWith('Personalizado') && styles.colorNameSelected]}>
                Otro...
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <InputField
          label="Placas del vehículo"
          placeholder="Ej. PTX-4821"
          iconName="numeric"
          value={plates}
          onChangeText={(txt) => {
            setPlacas(txt);
            if (errors.plates) setErrors((prev) => ({ ...prev, plates: '' }));
          }}
          autoCapitalize="characters"
          error={errors.plates}
          helperText="Tus placas solo se mostrarán a pasajeros que tengan un lugar aceptado."
        />

        <InputField
          label="Capacidad de asientos totales"
          placeholder="4"
          iconName="seat-passenger"
          value={capacity}
          onChangeText={(txt) => {
            setCapacity(txt);
            if (errors.capacity) setErrors((prev) => ({ ...prev, capacity: '' }));
          }}
          keyboardType="numeric"
          error={errors.capacity}
          helperText="Incluye el asiento del conductor (máx. lugares a ofertar = capacidad - 1)."
        />

        {/* Documento de circulación opcional */}
        <DocumentPickerField
          label="Tarjeta de circulación (Opcional)"
          sublabel="Comprobante de vehículo"
          instructions="Puedes adjuntar tu tarjeta de circulación en formato PDF, PNG o JPG."
          file={circulationDoc}
          onFileSelect={(f) => setCirculationDoc(f)}
        />

        {/* Declaración bajo protesta de decir verdad (RN-12) */}
        <TouchableOpacity
          style={styles.declarationCheckbox}
          onPress={() => {
            setDeclarationAccepted(!declarationAccepted);
            if (errors.declaration) setErrors((prev) => ({ ...prev, declaration: '' }));
          }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name={declarationAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={declarationAccepted ? THEME.colors.primary : THEME.colors.borderFocus}
          />
          <Text style={styles.declarationText}>
            Declaro bajo protesta de decir verdad que cuento con <Text style={{ fontWeight: '700' }}>licencia de conducir vigente</Text> y con <Text style={{ fontWeight: '700' }}>póliza de seguro vehicular con cobertura vigente</Text> (RN-12).
          </Text>
        </TouchableOpacity>
        {errors.declaration && <Text style={styles.errorText}>{errors.declaration}</Text>}

        {/* Botón de Guardar y Continuar */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSaveAndContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>Guardar Datos y Registrar Ruta</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Modales */}
      <CameraCaptureModal
        visible={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />

      <ColorPickerModal
        visible={showCustomColorModal}
        onClose={() => setShowCustomColorModal(false)}
        onColorSelect={(_hex, name) => setSelectedColor(name)}
      />
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
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: THEME.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  mainCard: {
    backgroundColor: THEME.colors.surface,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 20,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  sectionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    paddingBottom: 6,
    marginVertical: 16,
  },
  sectionDividerText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
    textTransform: 'uppercase',
  },
  cameraSection: {
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 16,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 14,
  },
  cameraInstructions: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  photoContainer: {
    alignItems: 'center',
  },
  photoPreviewWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  capturedImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: THEME.colors.accent,
  },
  photoBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.colors.surface,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.successBorder,
  },
  photoBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.success,
  },
  noPhotoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E2E8F0',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  noPhotoText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 6,
    fontWeight: '600',
  },
  openCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: THEME.borderRadius.pill,
  },
  openCameraBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  fieldSublabel: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginBottom: 8,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  colorChipSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primarySoft,
  },
  colorCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  colorName: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
  },
  colorNameSelected: {
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  declarationCheckbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
    padding: 10,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  declarationText: {
    flex: 1,
    fontSize: 12,
    color: THEME.colors.textPrimary,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 11,
    color: THEME.colors.error,
    marginTop: 4,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: THEME.colors.primary,
    paddingVertical: 14,
    borderRadius: THEME.borderRadius.md,
    marginTop: 24,
    ...THEME.shadows.hover,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

