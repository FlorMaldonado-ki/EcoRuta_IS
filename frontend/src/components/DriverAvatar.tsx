import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';

interface DriverAvatarProps {
  fullName?: string | null;
  photoUrl?: string | null;
  size?: number;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * Foto circular del conductor. Si no hay foto o no carga, muestra sus iniciales
 * (o un ícono genérico), siempre con el mismo tamaño para no mover el diseño.
 */
export const DriverAvatar: React.FC<DriverAvatarProps> = ({ fullName, photoUrl, size = 40 }) => {
  // Se recuerda qué URL falló: si cambia la foto se vuelve a intentar sin un efecto.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = !!photoUrl && failedUrl === photoUrl;

  const frame = { width: size, height: size, borderRadius: size / 2 };
  const label = fullName ? `Foto de ${fullName}` : 'Foto del conductor';

  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.base, frame]}
        resizeMode="cover"
        onError={() => setFailedUrl(photoUrl)}
        accessibilityLabel={label}
      />
    );
  }

  const text = fullName ? initials(fullName) : '';
  return (
    <View style={[styles.base, styles.fallback, frame]} accessibilityLabel={label} accessibilityRole="image">
      {text ? (
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]} numberOfLines={1}>
          {text}
        </Text>
      ) : (
        <MaterialCommunityIcons name="account" size={Math.round(size * 0.6)} color={THEME.colors.textInverse} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    borderColor: THEME.colors.accent,
    flexShrink: 0,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: THEME.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: THEME.colors.textInverse,
    fontWeight: '700',
  },
});
