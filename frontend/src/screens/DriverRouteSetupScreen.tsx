import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InputField } from '../components/InputField';
import { SelectModalField } from '../components/SelectModalField';
import { THEME } from '../constants/theme';
import { CAMPUS_REFERENCE_POINTS, MORELIA_ZONES } from '../constants/options';
import { saveDriverRoute, getDriverRoute } from '../services/tripStorage';
import type { DriverRoute, TripDirection, Place, UserDTO } from '../types/api';

interface DriverRouteSetupScreenProps {
  currentUser: UserDTO;
  onBack: () => void;
  onContinueToTestRoute: (route: DriverRoute) => void;
}

export const DriverRouteSetupScreen: React.FC<DriverRouteSetupScreenProps> = ({
  currentUser,
  onBack,
  onContinueToTestRoute,
}) => {
  const existingRoute = getDriverRoute();

  // Estados del formulario
  const [direction, setDirection] = useState<TripDirection>(
    existingRoute?.direction || 'to_campus'
  );
  const [selectedCampusKey, setSelectedCampusKey] = useState<string>(
    existingRoute?.campusPoint || 'campus_1'
  );

  // Zona predefinida o personalizada
  const defaultZone = MORELIA_ZONES[0];
  const [selectedZoneName, setSelectedZoneName] = useState<string>(
    existingRoute ? (existingRoute.direction === 'to_campus' ? existingRoute.origin.text : existingRoute.destination.text) : defaultZone.name
  );
  const [customAddress, setCustomAddress] = useState<string>('');
  const [useCustomAddress, setUseCustomAddress] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>(existingRoute?.notes || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Encontrar datos del campus seleccionado
  const currentCampus =
    CAMPUS_REFERENCE_POINTS.find((c) => c.key === selectedCampusKey) ||
    CAMPUS_REFERENCE_POINTS[0];

  const campusOptions = CAMPUS_REFERENCE_POINTS.map((c) => c.name);
  const zoneOptions = MORELIA_ZONES.map((z) => z.name);

  const handleSelectCampusByName = (name: string) => {
    const found = CAMPUS_REFERENCE_POINTS.find((c) => c.name === name);
    if (found) setSelectedCampusKey(found.key);
  };

  const handleContinue = () => {
    setErrorMsg(null);

    // Resolver coordenadas y texto de la parada exterior
    let exteriorPlace: Place;
    if (useCustomAddress) {
      if (!customAddress.trim()) {
        setErrorMsg('Por favor especifica la dirección o punto de partida.');
        return;
      }
      exteriorPlace = {
        text: customAddress.trim(),
        lat: 19.7025, // Centro de Morelia como fallback representativo
        lng: -101.1925,
      };
    } else {
      const zone = MORELIA_ZONES.find((z) => z.name === selectedZoneName) || defaultZone;
      exteriorPlace = {
        text: zone.name,
        lat: zone.lat,
        lng: zone.lng,
      };
    }

    const campusPlace: Place = {
      text: currentCampus.name,
      lat: currentCampus.lat,
      lng: currentCampus.lng,
    };

    const origin: Place = direction === 'to_campus' ? exteriorPlace : campusPlace;
    const destination: Place = direction === 'to_campus' ? campusPlace : exteriorPlace;

    const newRoute: DriverRoute = {
      id: existingRoute?.id || `route-${Date.now()}`,
      driverId: currentUser.id,
      direction,
      campusPoint: selectedCampusKey as any,
      origin,
      destination,
      meetingPoints: existingRoute?.meetingPoints || [],
      isConfigured: (existingRoute?.meetingPoints.length || 0) > 0,
      notes: notes.trim(),
      updatedAt: new Date().toISOString(),
    };

    saveDriverRoute(newRoute);
    onContinueToTestRoute(newRoute);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="Configuración Inicial de Ruta" />

      <View style={styles.body}>
        {/* Barra superior con volver */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={THEME.colors.primary} />
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>

        {/* Banner Explicativo */}
        <View style={styles.infoCard}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="map-marker-distance" size={26} color={THEME.colors.primary} />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>Ruta habitual del conductor</Text>
            <Text style={styles.infoDescription}>
              Define tu trayecto base hacia o desde el instituto. En el siguiente paso podrás tocar directamente el mapa interactivo para marcar tus puntos de encuentro.
            </Text>
          </View>
        </View>

        {errorMsg && (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={THEME.colors.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* Sección: Sentido del recorrido */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>1. Sentido del recorrido</Text>
          <Text style={styles.sectionSubtitle}>¿Hacia dónde viajas habitualmente?</Text>

          <View style={styles.directionToggleContainer}>
            <TouchableOpacity
              style={[
                styles.directionOption,
                direction === 'to_campus' && styles.directionOptionSelected,
              ]}
              onPress={() => setDirection('to_campus')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="school"
                size={24}
                color={direction === 'to_campus' ? THEME.colors.primary : THEME.colors.textMuted}
              />
              <Text
                style={[
                  styles.directionOptionTitle,
                  direction === 'to_campus' && styles.directionOptionTitleSelected,
                ]}
              >
                Hacia el Tec
              </Text>
              <Text style={styles.directionOptionDesc}>Tu colonia → Campus</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.directionOption,
                direction === 'from_campus' && styles.directionOptionSelected,
              ]}
              onPress={() => setDirection('from_campus')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="home"
                size={24}
                color={direction === 'from_campus' ? THEME.colors.primary : THEME.colors.textMuted}
              />
              <Text
                style={[
                  styles.directionOptionTitle,
                  direction === 'from_campus' && styles.directionOptionTitleSelected,
                ]}
              >
                Desde el Tec
              </Text>
              <Text style={styles.directionOptionDesc}>Campus → Tu colonia</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sección: Punto de Referencia Institucional */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>2. Sede del TecNM Morelia</Text>
          <Text style={styles.sectionSubtitle}>Selecciona el campus de salida o llegada</Text>

          <SelectModalField
            label="Campus de referencia"
            value={currentCampus.name}
            options={campusOptions}
            onSelect={handleSelectCampusByName}
            iconName="office-building-marker"
          />

          <View style={styles.campusDetailsBox}>
            <MaterialCommunityIcons name="map-marker-radius" size={18} color={THEME.colors.accent} />
            <Text style={styles.campusDetailsText}>
              <Text style={{ fontWeight: '700' }}>Ubicación:</Text> {currentCampus.description}
            </Text>
          </View>
        </View>

        {/* Sección: Punto Exterior (Zona o Domicilio) */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            3. {direction === 'to_campus' ? 'Punto de partida' : 'Punto de llegada'}
          </Text>
          <Text style={styles.sectionSubtitle}>
            Indica tu zona habitual en la ciudad de Morelia
          </Text>

          {!useCustomAddress ? (
            <>
              <SelectModalField
                label="Zona o colonia en Morelia"
                value={selectedZoneName}
                options={zoneOptions}
                onSelect={(val) => setSelectedZoneName(val)}
                iconName="map-marker"
              />
              <TouchableOpacity
                style={styles.toggleCustomBtn}
                onPress={() => setUseCustomAddress(true)}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={THEME.colors.primary} />
                <Text style={styles.toggleCustomBtnText}>
                  Prefiero escribir una dirección o referencia exacta
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <InputField
                label="Dirección o referencia exacta"
                value={customAddress}
                onChangeText={setCustomAddress}
                placeholder="Ej. Oxxo Av. Camelinas esq. Solidaridad"
                iconName="map-marker-outline"
              />
              <TouchableOpacity
                style={styles.toggleCustomBtn}
                onPress={() => setUseCustomAddress(false)}
              >
                <MaterialCommunityIcons name="format-list-bulleted" size={16} color={THEME.colors.primary} />
                <Text style={styles.toggleCustomBtnText}>
                  Seleccionar de la lista de zonas conocidas
                </Text>
              </TouchableOpacity>
            </>
          )}

          <InputField
            label="Instrucciones o notas adicionales (Opcional)"
            value={notes}
            onChangeText={setNotes}
            required={false}
            placeholder="Ej. Salgo de la cochera a las 6:40 am, no mascotas."
            iconName="note-text-outline"
          />
        </View>

        {/* Botón continuar */}
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="map-marker-plus" size={22} color={THEME.colors.textInverse} />
          <Text style={styles.continueBtnText}>
            Continuar a Mapa Interactivo y Puntos de Encuentro
          </Text>
        </TouchableOpacity>
      </View>
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
  infoCard: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    ...THEME.shadows.card,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.4)',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  infoDescription: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.errorBg,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: THEME.colors.error,
    fontWeight: '600',
    flex: 1,
  },
  sectionCard: {
    backgroundColor: THEME.colors.surface,
    padding: 18,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 16,
    ...THEME.shadows.card,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 14,
    marginTop: 2,
  },
  directionToggleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  directionOption: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.md,
    padding: 14,
    alignItems: 'center',
  },
  directionOptionSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primarySoft,
  },
  directionOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    marginTop: 8,
  },
  directionOptionTitleSelected: {
    color: THEME.colors.primary,
  },
  directionOptionDesc: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  campusDetailsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    padding: 10,
    borderRadius: THEME.borderRadius.sm,
    gap: 8,
    marginTop: -4,
  },
  campusDetailsText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    flex: 1,
  },
  toggleCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    marginTop: -8,
    marginBottom: 10,
  },
  toggleCustomBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.md,
    height: 52,
    gap: 10,
    marginTop: 8,
    ...THEME.shadows.hover,
  },
  continueBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
});
