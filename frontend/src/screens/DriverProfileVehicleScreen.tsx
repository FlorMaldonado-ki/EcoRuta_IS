import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InputField } from '../components/InputField';
import { SelectModalField } from '../components/SelectModalField';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { ColorPickerModal } from '../components/ColorPickerModal';
import { THEME } from '../constants/theme';
import { COMMON_VEHICLE_COLORS } from '../constants/options';
import { saveDriverPhoto, getDriverPhoto } from '../services/tripStorage';
import { createVehicle, updateVehicle, getMyVehicles, getVehicleCatalog } from '../services/vehicleService';
import { uploadProfilePhoto } from '../services/authService';
import { ApiError } from '../services/apiClient';
import { errorMessage } from '../services/tripService';
import type { UserDTO } from '../types/api';
import type { ApiVehicleCatalog, ApiVehicleDTO, ApiVehicleRequest, VehicleType } from '../types/apiBackend';

interface DriverProfileVehicleScreenProps {
  currentUser: UserDTO;
  onBack: () => void;
  onGoToRouteSetup: () => void;
}

type Mode = { kind: 'list' } | { kind: 'form'; vehicle: ApiVehicleDTO | null };
type FormErrors = Partial<Record<'photo' | 'type' | 'brand' | 'model' | 'year' | 'color' | 'plates' | 'capacity' | 'declaration', string>>;

const CAPACITY_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9];
const TYPE_ICONS: Record<VehicleType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  automovil: 'car-side',
  suv: 'car-estate',
  pickup: 'car-pickup',
};

/** Igual que la API: mayúsculas, sin espacios, guiones ni puntos. */
const normalizePlates = (v: string) => v.toUpperCase().replace(/[\s.-]/g, '');
const mapServerField = (k: string) => (k === 'licenseAndInsuranceDeclared' ? 'declaration' : k);
const sortEs = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
const sameText = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

export const DriverProfileVehicleScreen: React.FC<DriverProfileVehicleScreenProps> = ({
  currentUser,
  onBack,
  onGoToRouteSetup,
}) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(currentUser.photoUrl || getDriverPhoto() || null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<ApiVehicleDTO[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [notice, setNotice] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<ApiVehicleCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [type, setType] = useState<VehicleType | null>(null);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [color, setColor] = useState<string>(COMMON_VEHICLE_COLORS[0].name);
  const [showCustomColorModal, setShowCustomColorModal] = useState(false);
  const [plates, setPlates] = useState('');
  const [capacity, setCapacity] = useState(5);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    setVehiclesError(null);
    try {
      setVehicles(await getMyVehicles());
    } catch (err) {
      setVehiclesError(errorMessage(err));
    } finally {
      setLoadingVehicles(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogError(null);
    try {
      setCatalog(await getVehicleCatalog());
    } catch (err) {
      setCatalogError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    let active = true;
    getMyVehicles()
      .then((list) => active && setVehicles(list))
      .catch((err) => active && setVehiclesError(errorMessage(err)))
      .finally(() => active && setLoadingVehicles(false));
    getVehicleCatalog()
      .then((c) => active && setCatalog(c))
      .catch((err) => active && setCatalogError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  // ── Opciones dependientes: tipo → marca → modelo → año ────────────────────
  const typeLabels = useMemo(() => {
    const withModels = new Set(catalog?.models.map((m) => m.type));
    return (catalog?.types ?? []).filter((t) => withModels.has(t.key));
  }, [catalog]);

  const brandOptions = useMemo(() => {
    if (!catalog || !type) return [];
    return [...new Set(catalog.models.filter((m) => m.type === type).map((m) => m.brand))].sort(sortEs);
  }, [catalog, type]);

  const modelOptions = useMemo(() => {
    if (!catalog || !type || !brand) return [];
    return catalog.models
      .filter((m) => m.type === type && m.brand === brand)
      .map((m) => m.model)
      .sort(sortEs);
  }, [catalog, type, brand]);

  const yearOptions = useMemo(() => {
    const entry = catalog?.models.find((m) => m.type === type && m.brand === brand && m.model === model);
    return entry ? [...entry.years].sort((a, b) => b - a) : [];
  }, [catalog, type, brand, model]);

  const clearError = (key: keyof FormErrors) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  // Al cambiar un nivel se invalidan los siguientes si ya no corresponden.
  const selectType = (label: string) => {
    const next = typeLabels.find((t) => t.label === label)?.key ?? null;
    if (next === type) return;
    setType(next);
    const brandStillValid = !!catalog?.models.some((m) => m.type === next && m.brand === brand);
    if (!brandStillValid) setBrand('');
    const modelStillValid = !!catalog?.models.some((m) => m.type === next && m.brand === brand && m.model === model);
    if (!modelStillValid) {
      setModel('');
      setYear(null);
    }
    clearError('type');
  };

  const selectBrand = (value: string) => {
    if (value === brand) return;
    setBrand(value);
    setModel('');
    setYear(null);
    clearError('brand');
  };

  const selectModel = (value: string) => {
    if (value === model) return;
    setModel(value);
    const years = catalog?.models.find((m) => m.type === type && m.brand === brand && m.model === value)?.years ?? [];
    if (year !== null && !years.includes(year)) setYear(null);
    clearError('model');
  };

  // ── Modos ─────────────────────────────────────────────────────────────────
  const openForm = (vehicle: ApiVehicleDTO | null) => {
    setNotice(null);
    setSaveError(null);
    setErrors({});
    if (vehicle) {
      // Vehículos anteriores al catálogo pueden no tener tipo/año o una escritura distinta.
      const match = catalog?.models.find(
        (m) => (!vehicle.type || m.type === vehicle.type) && sameText(m.brand, vehicle.brand) && sameText(m.model, vehicle.model)
      );
      setType(vehicle.type ?? match?.type ?? null);
      setBrand(match?.brand ?? '');
      setModel(match?.model ?? '');
      setYear(vehicle.year && match?.years.includes(vehicle.year) ? vehicle.year : null);
      setColor(vehicle.color);
      setPlates(vehicle.plates);
      setCapacity(vehicle.capacity);
      setDeclarationAccepted(vehicle.licenseAndInsuranceDeclared);
    } else {
      setType(null);
      setBrand('');
      setModel('');
      setYear(null);
      setColor(COMMON_VEHICLE_COLORS[0].name);
      setPlates('');
      setCapacity(5);
      setDeclarationAccepted(false);
    }
    setMode({ kind: 'form', vehicle });
  };

  const closeForm = () => {
    setErrors({});
    setMode({ kind: 'list' });
  };

  const editing = mode.kind === 'form' ? mode.vehicle : null;
  const handleBack = () => {
    if (mode.kind === 'form' && vehicles.length > 0) closeForm();
    else onBack();
  };

  // ── Foto ──────────────────────────────────────────────────────────────────
  const handlePhotoCaptured = async (dataUrl: string) => {
    setPhotoUrl(dataUrl);
    saveDriverPhoto(dataUrl);
    setPhotoError(null);
    clearError('photo');
    setPhotoUploading(true);
    try {
      const user = await uploadProfilePhoto(dataUrl);
      if (user.photoUrl) setPhotoUrl(user.photoUrl);
    } catch (err) {
      setPhotoError(`No se pudo guardar la foto: ${errorMessage(err)}`);
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── Guardar ───────────────────────────────────────────────────────────────
  const validate = (): FormErrors => {
    const err: FormErrors = {};
    if (!photoUrl) err.photo = 'Toma tu fotografía de conductor antes de guardar el vehículo.';
    if (!type) err.type = 'Selecciona el tipo de vehículo.';
    if (!brand) err.brand = 'Selecciona la marca.';
    if (!model) err.model = 'Selecciona el modelo.';
    if (year === null) err.year = 'Selecciona el año.';
    else if (!yearOptions.includes(year)) err.year = 'Ese año no corresponde al modelo seleccionado.';
    if (!color) err.color = 'Selecciona el color.';

    const clean = normalizePlates(plates);
    if (!clean) err.plates = 'Las placas son obligatorias.';
    else if (!/^[A-Z0-9]{5,10}$/.test(clean)) err.plates = 'Las placas deben tener de 5 a 10 letras o números.';
    else if (vehicles.some((v) => v.id !== editing?.id && v.plates === clean)) {
      err.plates = 'Ya registraste un vehículo con esas placas.';
    }

    if (!CAPACITY_OPTIONS.includes(capacity)) err.capacity = 'Selecciona la capacidad (2 a 9 personas).';
    if (!declarationAccepted) {
      err.declaration = 'Debes declarar que cuentas con licencia y seguro vigentes.';
    }
    return err;
  };

  const handleSave = async () => {
    if (saving) return;
    const err = validate();
    setErrors(err);
    setSaveError(null);
    if (Object.keys(err).length > 0) {
      setSaveError('Revisa los campos marcados.');
      return;
    }

    const payload: ApiVehicleRequest = {
      type: type as VehicleType,
      brand,
      model,
      year: year as number,
      color,
      plates: normalizePlates(plates),
      capacity,
      licenseAndInsuranceDeclared: true,
    };

    setSaving(true);
    try {
      const saved = editing ? await updateVehicle(editing.id, payload) : await createVehicle(payload);
      setVehicles((prev) => [saved, ...prev.filter((v) => v.id !== saved.id)]);
      setNotice(editing ? 'Cambios guardados.' : 'Vehículo registrado. Ya puedes usarlo al publicar un viaje.');
      setMode({ kind: 'list' });
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) {
        const server: FormErrors = {};
        Object.entries(e.fields).forEach(([k, v]) => {
          server[mapServerField(k) as keyof FormErrors] = v;
        });
        setErrors((prev) => ({ ...prev, ...server }));
      }
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const typeLabel = (t: VehicleType | null) => catalog?.types.find((x) => x.key === t)?.label ?? null;
  const colorHex = (name: string) => COMMON_VEHICLE_COLORS.find((c) => c.name === name)?.hex;
  const catalogEmpty = catalog !== null && catalog.models.length === 0;
  const backLabel = mode.kind === 'form' && vehicles.length > 0 ? 'Mis vehículos' : 'Regresar';

  const renderPhotoCard = () => (
    <View style={styles.card}>
      <View style={styles.profileRow}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.profilePhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.profilePhoto, styles.noPhoto]}>
            <MaterialCommunityIcons name="camera-plus-outline" size={30} color={THEME.colors.primary} />
          </View>
        )}
        <View style={styles.profileText}>
          <Text style={styles.profileName} numberOfLines={2}>{currentUser.fullName}</Text>
          <Text style={styles.profileHint}>
            {photoUrl
              ? 'Los pasajeros verán esta foto en tus viajes.'
              : 'Toma tu foto con la cámara de la app (no se permiten fotos de galería).'}
          </Text>
          <TouchableOpacity
            style={styles.photoBtn}
            onPress={() => setShowCameraModal(true)}
            disabled={photoUploading}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            {photoUploading ? (
              <ActivityIndicator size="small" color={THEME.colors.primary} />
            ) : (
              <MaterialCommunityIcons name="camera" size={16} color={THEME.colors.primary} />
            )}
            <Text style={styles.photoBtnText}>
              {photoUploading ? 'Guardando foto...' : photoUrl ? 'Cambiar foto' : 'Tomar foto'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {photoError || errors.photo ? <Text style={styles.errorText}>{photoError ?? errors.photo}</Text> : null}
    </View>
  );

  const renderVehicleCard = (v: ApiVehicleDTO) => {
    const incomplete = !v.type || !v.year;
    const hex = colorHex(v.color);
    return (
      <View key={v.id} style={styles.card}>
        <View style={styles.vehicleHeader}>
          <View style={styles.vehicleIcon}>
            <MaterialCommunityIcons name={v.type ? TYPE_ICONS[v.type] : 'car'} size={24} color={THEME.colors.primary} />
          </View>
          <View style={styles.vehicleTitleBox}>
            <Text style={styles.vehicleTitle} numberOfLines={2}>
              {v.brand} {v.model}{v.year ? ` ${v.year}` : ''}
            </Text>
            <Text style={styles.vehicleSubtitle} numberOfLines={1}>
              {typeLabel(v.type) ?? 'Tipo sin especificar'}
            </Text>
          </View>
        </View>

        <View style={styles.specGrid}>
          <View style={styles.spec}>
            <Text style={styles.specLabel}>Color</Text>
            <View style={styles.specValueRow}>
              {hex ? <View style={[styles.colorDot, { backgroundColor: hex }]} /> : null}
              <Text style={styles.specValue} numberOfLines={1}>{v.color}</Text>
            </View>
          </View>
          <View style={styles.spec}>
            <Text style={styles.specLabel}>Placas</Text>
            <Text style={styles.specValue} numberOfLines={1}>{v.plates}</Text>
          </View>
          <View style={styles.spec}>
            <Text style={styles.specLabel}>Capacidad</Text>
            <Text style={styles.specValue} numberOfLines={1}>
              {v.capacity} personas · {v.maxSeats} para pasajeros
            </Text>
          </View>
          <View style={styles.spec}>
            <Text style={styles.specLabel}>Licencia y seguro</Text>
            <Text style={styles.specValue} numberOfLines={1}>
              {v.licenseAndInsuranceDeclared ? 'Declarados vigentes' : 'Sin declarar'}
            </Text>
          </View>
        </View>

        {incomplete ? (
          <View style={styles.warningBox}>
            <MaterialCommunityIcons name="alert-outline" size={16} color={THEME.colors.warning} />
            <Text style={styles.warningText}>Completa el tipo y el año desde el catálogo.</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => openForm(v)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${v.brand} ${v.model}`}
        >
          <MaterialCommunityIcons name="pencil-outline" size={16} color={THEME.colors.primary} />
          <Text style={styles.editBtnText}>Editar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderList = () => (
    <>
      {renderPhotoCard()}

      <Text style={styles.sectionTitle}>Mis vehículos</Text>

      {loadingVehicles ? (
        <ActivityIndicator style={styles.loader} color={THEME.colors.primary} />
      ) : vehicles.length === 0 && !vehiclesError ? (
        <View style={[styles.card, styles.emptyCard]}>
          <MaterialCommunityIcons name="car-off" size={42} color={THEME.colors.textMuted} />
          <Text style={styles.emptyTitle}>Aún no registras un vehículo</Text>
          <Text style={styles.emptySubtitle}>Lo necesitas para publicar viajes como conductor.</Text>
        </View>
      ) : (
        vehicles.map(renderVehicleCard)
      )}

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => openForm(null)}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="plus" size={20} color={THEME.colors.textInverse} />
        <Text style={styles.primaryBtnText}>
          {vehicles.length ? 'Registrar otro vehículo' : 'Registrar vehículo'}
        </Text>
      </TouchableOpacity>

      {vehicles.length > 0 ? (
        <TouchableOpacity style={styles.linkBtn} onPress={onGoToRouteSetup} activeOpacity={0.7}>
          <MaterialCommunityIcons name="map-marker-path" size={16} color={THEME.colors.primary} />
          <Text style={styles.linkBtnText}>Configurar mi ruta habitual</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  const renderForm = () => (
    <>
      {renderPhotoCard()}

      <View style={styles.card}>
        <Text style={styles.formTitle}>{editing ? 'Editar vehículo' : 'Registrar vehículo'}</Text>
        <Text style={styles.formSubtitle}>
          Elige tu vehículo del catálogo en orden: tipo, marca, modelo y año.
        </Text>

        {catalogError ? (
          <View style={styles.warningBox}>
            <MaterialCommunityIcons name="wifi-alert" size={16} color={THEME.colors.warning} />
            <Text style={styles.warningText}>No se pudo cargar el catálogo: {catalogError}</Text>
            <TouchableOpacity onPress={loadCatalog} activeOpacity={0.7}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : catalog === null ? (
          <ActivityIndicator style={styles.loader} color={THEME.colors.primary} />
        ) : catalogEmpty ? (
          <View style={styles.warningBox}>
            <MaterialCommunityIcons name="database-alert-outline" size={16} color={THEME.colors.warning} />
            <Text style={styles.warningText}>
              El catálogo de vehículos todavía no está disponible. Intenta más tarde o avisa al administrador.
            </Text>
          </View>
        ) : (
          <>
            <SelectModalField
              label="Tipo de vehículo"
              placeholder="Selecciona el tipo"
              iconName="car-info"
              options={typeLabels.map((t) => t.label)}
              value={typeLabel(type) ?? ''}
              onSelect={selectType}
              error={errors.type}
            />
            <SelectModalField
              label="Marca"
              placeholder={type ? 'Selecciona la marca' : 'Primero elige el tipo'}
              iconName="factory"
              options={brandOptions}
              value={brand}
              onSelect={selectBrand}
              disabled={!type}
              error={errors.brand}
            />
            <SelectModalField
              label="Modelo"
              placeholder={brand ? 'Selecciona el modelo' : 'Primero elige la marca'}
              iconName="car"
              options={modelOptions}
              value={model}
              onSelect={selectModel}
              disabled={!brand}
              error={errors.model}
            />
            <SelectModalField
              label="Año"
              placeholder={model ? 'Selecciona el año' : 'Primero elige el modelo'}
              iconName="calendar"
              options={yearOptions.map(String)}
              value={year ? String(year) : ''}
              onSelect={(v) => {
                setYear(Number(v));
                clearError('year');
              }}
              disabled={!model}
              error={errors.year}
            />
          </>
        )}

        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>Color *</Text>
          <View style={styles.chipRow}>
            {COMMON_VEHICLE_COLORS.map((c) => {
              const selected = color === c.name;
              return (
                <TouchableOpacity
                  key={c.name}
                  style={[styles.colorChip, selected && styles.chipSelected]}
                  onPress={() => {
                    setColor(c.name);
                    clearError('color');
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.colorCircle, { backgroundColor: c.hex, borderColor: c.border }]} />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.colorChip, color.startsWith('Personalizado') && styles.chipSelected]}
              onPress={() => setShowCustomColorModal(true)}
              accessibilityRole="radio"
              accessibilityState={{ selected: color.startsWith('Personalizado') }}
            >
              <MaterialCommunityIcons name="palette" size={16} color={THEME.colors.primary} />
              <Text style={[styles.chipText, color.startsWith('Personalizado') && styles.chipTextSelected]}>
                Otro...
              </Text>
            </TouchableOpacity>
          </View>
          {errors.color ? <Text style={styles.errorText}>{errors.color}</Text> : null}
        </View>

        <InputField
          label="Placas"
          placeholder="Ej. PTX-4821"
          iconName="card-text-outline"
          value={plates}
          onChangeText={(txt) => {
            setPlates(txt.toUpperCase());
            clearError('plates');
          }}
          autoCapitalize="characters"
          error={errors.plates}
          helperText="Solo las verán los pasajeros con lugar aceptado."
        />

        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>Capacidad total (incluye al conductor) *</Text>
          <View style={styles.chipRow}>
            {CAPACITY_OPTIONS.map((n) => {
              const selected = capacity === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.capacityChip, selected && styles.capacityChipSelected]}
                  onPress={() => {
                    setCapacity(n);
                    clearError('capacity');
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${n} personas`}
                >
                  <Text style={[styles.capacityText, selected && styles.capacityTextSelected]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.fieldHint}>Podrás ofrecer hasta {capacity - 1} lugar(es) por viaje.</Text>
          {errors.capacity ? <Text style={styles.errorText}>{errors.capacity}</Text> : null}
        </View>

        <TouchableOpacity
          style={styles.declarationCheckbox}
          onPress={() => {
            setDeclarationAccepted(!declarationAccepted);
            clearError('declaration');
          }}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: declarationAccepted }}
        >
          <MaterialCommunityIcons
            name={declarationAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={declarationAccepted ? THEME.colors.primary : THEME.colors.borderFocus}
          />
          <Text style={styles.declarationText}>
            Declaro bajo protesta de decir verdad que cuento con{' '}
            <Text style={styles.bold}>licencia de conducir vigente</Text> y con{' '}
            <Text style={styles.bold}>póliza de seguro vehicular vigente</Text>.
          </Text>
        </TouchableOpacity>
        {errors.declaration ? <Text style={styles.errorText}>{errors.declaration}</Text> : null}

        {saveError ? (
          <View style={[styles.errorBox, styles.saveErrorBox]}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={THEME.colors.error} />
            <Text style={styles.errorBoxText}>{saveError}</Text>
          </View>
        ) : null}

        <View style={styles.formActions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={vehicles.length ? closeForm : onBack}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.saveBtn, (saving || catalogEmpty || !catalog) && styles.btnDisabled]}
            onPress={handleSave}
            disabled={saving || catalogEmpty || !catalog}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator size="small" color={THEME.colors.textInverse} /> : null}
            <Text style={styles.primaryBtnText}>{saving ? 'Guardando...' : 'Guardar vehículo'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <Header subtitle="Mi perfil de conductor" />
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notice ? (
          <View style={styles.successBox}>
            <MaterialCommunityIcons name="check-circle" size={18} color={THEME.colors.success} />
            <Text style={styles.successText}>{notice}</Text>
          </View>
        ) : null}
        {vehiclesError ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={THEME.colors.error} />
            <Text style={styles.errorBoxText}>{vehiclesError}</Text>
            <TouchableOpacity onPress={loadVehicles} activeOpacity={0.7}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {mode.kind === 'list' ? renderList() : renderForm()}
      </ScrollView>

      <CameraCaptureModal
        visible={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />
      <ColorPickerModal
        visible={showCustomColorModal}
        onClose={() => setShowCustomColorModal(false)}
        onColorSelect={(_hex, name) => {
          setColor(name);
          clearError('color');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' },
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: THEME.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backButtonText: { fontSize: 14, fontWeight: '700', color: THEME.colors.primary },
  card: {
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 14,
    ...THEME.shadows.card,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profilePhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: THEME.colors.accent,
  },
  noPhoto: {
    backgroundColor: THEME.colors.primarySoft,
    borderStyle: 'dashed',
    borderColor: THEME.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 16, fontWeight: '800', color: THEME.colors.textPrimary },
  profileHint: { fontSize: 12, color: THEME.colors.textSecondary, marginTop: 2, lineHeight: 17 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.borderRadius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: THEME.colors.primary },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  loader: { marginVertical: 18 },
  emptyCard: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: THEME.colors.textPrimary },
  emptySubtitle: { fontSize: 13, color: THEME.colors.textSecondary, textAlign: 'center' },
  vehicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  vehicleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleTitleBox: { flex: 1, minWidth: 0 },
  vehicleTitle: { fontSize: 16, fontWeight: '800', color: THEME.colors.textPrimary },
  vehicleSubtitle: { fontSize: 12, color: THEME.colors.textSecondary, marginTop: 2 },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  spec: { width: '50%', paddingRight: 8 },
  specLabel: { fontSize: 11, fontWeight: '700', color: THEME.colors.textMuted, textTransform: 'uppercase' },
  specValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  specValue: { fontSize: 13, fontWeight: '600', color: THEME.colors.textPrimary, marginTop: 2, flexShrink: 1 },
  colorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: THEME.colors.borderSubtle },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    padding: 10,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.warningBg,
    borderWidth: 1,
    borderColor: THEME.colors.warningBorder,
  },
  warningText: { flex: 1, minWidth: 160, fontSize: 12, color: THEME.colors.textPrimary, lineHeight: 17 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    minHeight: 40,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
  },
  editBtnText: { fontSize: 14, fontWeight: '700', color: THEME.colors.primary },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.primary,
    ...THEME.shadows.card,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: THEME.colors.textInverse },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, padding: 8 },
  linkBtnText: { fontSize: 13, fontWeight: '700', color: THEME.colors.primary },
  formTitle: { fontSize: 18, fontWeight: '800', color: THEME.colors.textPrimary },
  formSubtitle: { fontSize: 13, color: THEME.colors.textSecondary, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  fieldWrapper: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: THEME.colors.textPrimary, marginBottom: 8 },
  fieldHint: { fontSize: 11, color: THEME.colors.textMuted, marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  chipSelected: { borderColor: THEME.colors.primary, backgroundColor: THEME.colors.primarySoft },
  colorCircle: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 12, color: THEME.colors.textPrimary },
  chipTextSelected: { fontWeight: '700', color: THEME.colors.primary },
  capacityChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  capacityChipSelected: { backgroundColor: THEME.colors.primary, borderColor: THEME.colors.primary },
  capacityText: { fontSize: 14, fontWeight: '700', color: THEME.colors.textPrimary },
  capacityTextSelected: { color: THEME.colors.textInverse },
  declarationCheckbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    padding: 10,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  declarationText: { flex: 1, fontSize: 12, color: THEME.colors.textPrimary, lineHeight: 18 },
  bold: { fontWeight: '700' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: THEME.colors.textSecondary },
  saveBtn: { flex: 2 },
  btnDisabled: { opacity: 0.6 },
  errorText: { fontSize: 12, color: THEME.colors.error, marginTop: 6 },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 14,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.successBg,
    borderWidth: 1,
    borderColor: THEME.colors.successBorder,
  },
  successText: { flex: 1, fontSize: 13, fontWeight: '700', color: THEME.colors.success },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    marginBottom: 14,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.errorBg,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
  },
  saveErrorBox: { marginTop: 16, marginBottom: 0 },
  errorBoxText: { flex: 1, minWidth: 160, fontSize: 13, color: THEME.colors.error },
  retryText: { fontSize: 13, fontWeight: '800', color: THEME.colors.primary },
});
