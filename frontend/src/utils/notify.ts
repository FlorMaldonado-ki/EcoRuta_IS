import { Alert, Platform } from 'react-native';

/** Alert.alert no hace nada en Expo Web; este helper funciona en ambas plataformas. */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/** Aviso con un único botón que ejecuta una acción al cerrarlo (p. ej. navegar). */
export function notifyThen(title: string, message: string, buttonLabel: string, onClose: () => void) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    onClose();
    return;
  }
  Alert.alert(title, message, [{ text: buttonLabel, onPress: onClose }], { cancelable: false });
}

/** Pregunta con un botón de acción (p. ej. "Reenviar enlace"). */
export function confirmAction(title: string, message: string, actionLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}\n\n¿${actionLabel}?`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cerrar', style: 'cancel' },
    { text: actionLabel, onPress: onConfirm },
  ]);
}
