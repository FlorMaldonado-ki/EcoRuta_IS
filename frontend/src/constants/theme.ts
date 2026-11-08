export const THEME = {
  colors: {
    // Colores institucionales TecNM Campus Morelia
    primary: '#6B1736',         // Guinda institucional
    primaryDark: '#4F0F27',     // Guinda oscuro / hover / pressed
    primaryLight: '#8C2349',    // Guinda claro
    primarySoft: '#FBF0F4',     // Guinda de fondo suave / tag

    accent: '#C59B27',          // Dorado institucional
    accentLight: '#F3E5AB',     // Dorado suave
    accentDark: '#997314',      // Dorado oscuro
    accentGlow: 'rgba(197, 155, 39, 0.25)',

    // Fondo y superficies
    background: '#F4F6F9',      // Fondo general
    surface: '#FFFFFF',         // Tarjetas y modales
    surfaceAlt: '#F8FAFC',      // Inputs y secciones secundarias

    // Textos
    textPrimary: '#1E293B',     // Títulos y textos principales
    textSecondary: '#64748B',   // Subtítulos y descripciones
    textMuted: '#94A3B8',       // Placeholders e hints
    textInverse: '#FFFFFF',     // Texto sobre guinda

    // Bordes
    border: '#E2E8F0',          // Borde estándar
    borderFocus: '#6B1736',     // Borde enfocado
    borderSubtle: '#CBD5E1',

    // Estados
    success: '#15803D',
    successBg: '#F0FDF4',
    successBorder: '#86EFAC',

    error: '#DC2626',
    errorBg: '#FEF2F2',
    errorBorder: '#FCA5A5',

    warning: '#D97706',
    warningBg: '#FFFBEB',
    warningBorder: '#FDE68A',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    pill: 999,
    full: 999,
  },
  shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    hover: {
      shadowColor: '#6B1736',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 4,
    },
  },
};
