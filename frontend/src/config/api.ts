import { Platform } from 'react-native';

/**
 * URL base de la API.
 * Se configura en frontend/.env:   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
 *   - Celular físico con Expo Go: la IP de tu PC en la misma red Wi-Fi (ipconfig en Windows).
 *   - Emulador de Android: http://10.0.2.2:3000
 *   - Expo Web en la misma PC: http://localhost:3000
 *   - Producción: https://ecoruta-api.onrender.com
 * Después de cambiar .env, reinicia con:  npx expo start -c
 */
const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_URL).replace(/\/+$/, '');

/**
 * Render (plan gratuito) "duerme" el servicio tras 15 min sin uso y tarda
 * hasta ~50 s en despertar; Neon también suspende el cómputo. Por eso el
 * tiempo de espera es amplio.
 */
export const API_TIMEOUT_MS = 60_000;
