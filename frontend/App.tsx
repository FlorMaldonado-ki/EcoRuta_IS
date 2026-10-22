import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { AuthenticatedHomeScreen } from './src/screens/AuthenticatedHomeScreen';
import { THEME } from './src/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { setAuthToken } from './src/services/apiClient';
import type { Session } from './src/types/api';

type ScreenType = 'login' | 'register' | 'authenticated';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('register');
  // Sesión en memoria: { token JWT, user: UserDTO }. Para conservarla al cerrar la app,
  // agregar expo-secure-store (npx expo install expo-secure-store) y guardar session.token.
  const [session, setSession] = useState<Session | null>(null);

  const handleLoginSuccess = (newSession: Session) => {
    setAuthToken(newSession.token); // todas las peticiones siguientes llevan Authorization: Bearer
    setSession(newSession);
    setCurrentScreen('authenticated');
  };

  // RF-03 · Cerrar sesión: la API es stateless, basta con descartar el token.
  const handleLogout = () => {
    setAuthToken(null);
    setSession(null);
    setCurrentScreen('login');
  };



  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />

        {/* Barra superior de pestañas de navegación rápida para evaluación */}
        {currentScreen !== 'authenticated' && (
          <View style={styles.navBar}>
            <TouchableOpacity
              style={[
                styles.navTab,
                currentScreen === 'register' && styles.navTabActive,
              ]}
              onPress={() => setCurrentScreen('register')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="account-plus"
                size={16}
                color={
                  currentScreen === 'register'
                    ? THEME.colors.accent
                    : 'rgba(255, 255, 255, 0.65)'
                }
              />
              <Text
                style={[
                  styles.navTabText,
                  currentScreen === 'register' && styles.navTabTextActive,
                ]}
              >
                Registro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.navTab,
                currentScreen === 'login' && styles.navTabActive,
              ]}
              onPress={() => setCurrentScreen('login')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="login"
                size={16}
                color={
                  currentScreen === 'login'
                    ? THEME.colors.accent
                    : 'rgba(255, 255, 255, 0.65)'
                }
              />
              <Text
                style={[
                  styles.navTabText,
                  currentScreen === 'login' && styles.navTabTextActive,
                ]}
              >
                Iniciar Sesión
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.content}>
          {currentScreen === 'register' && (
            <RegisterScreen onNavigateToLogin={() => setCurrentScreen('login')} />
          )}

          {currentScreen === 'login' && (
            <LoginScreen
              onNavigateToRegister={() => setCurrentScreen('register')}
              onLoginSuccess={handleLoginSuccess}
            />
          )}

          {currentScreen === 'authenticated' && session && (
            <AuthenticatedHomeScreen user={session.user} onLogout={handleLogout} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.primaryDark,
  },
  navBar: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(197, 155, 39, 0.25)',
    justifyContent: 'center',
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  navTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.5)',
  },
  navTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  navTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
});
