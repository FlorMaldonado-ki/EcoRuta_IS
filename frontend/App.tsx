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
import type { Session, UserDTO } from './src/types/api';

type ScreenType = 'login' | 'register' | 'authenticated';

const DEMO_USER: UserDTO = {
  id: 'current-user',
  fullName: 'Mario Alberto Tena Morales',
  email: 'mario.tena@morelia.tecnm.mx',
  userType: 'alumno',
  role: 'user',
  status: 'active',
  emailVerified: true,
  career: 'Ingeniería en Sistemas Computacionales',
  department: null,
  phone: '4431234567',
  controlNumber: '19120145',
  createdAt: new Date().toISOString(),
  photoUrl: null,
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('authenticated');
  const [session, setSession] = useState<Session | null>({
    token: 'demo-sprint2-jwt-token',
    user: DEMO_USER,
  });

  const handleLoginSuccess = (newSession: Session) => {
    setAuthToken(newSession.token);
    setSession(newSession);
    setCurrentScreen('authenticated');
  };

  const handleLogout = () => {
    setAuthToken(null);
    setSession(null);
    setCurrentScreen('login');
  };

  const handleQuickDemoSession = () => {
    setSession({
      token: 'demo-sprint2-jwt-token',
      user: DEMO_USER,
    });
    setCurrentScreen('authenticated');
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

            <TouchableOpacity
              style={[styles.navTab, styles.demoTab]}
              onPress={handleQuickDemoSession}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="rocket-launch"
                size={16}
                color={THEME.colors.accent}
              />
              <Text style={[styles.navTabText, styles.demoTabText]}>
                Sprint 2 Demo
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
    flexWrap: 'wrap',
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  navTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.5)',
  },
  demoTab: {
    backgroundColor: 'rgba(197, 155, 39, 0.2)',
    borderWidth: 1,
    borderColor: THEME.colors.accent,
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
  demoTabText: {
    color: THEME.colors.accent,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
});
