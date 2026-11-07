export const TECNM_MORELIA_CAREERS = [
  'Ingeniería en Sistemas Computacionales',
  'Ingeniería en Tecnologías de la Información y Comunicaciones',
  'Ingeniería Mecatrónica',
  'Ingeniería Electrónica',
  'Ingeniería Mecánica',
  'Ingeniería Eléctrica',
  'Ingeniería Industrial',
  'Ingeniería Bioquímica',
  'Ingeniería en Materiales',
  'Ingeniería en Gestión Empresarial',
  'Licenciatura en Administración',
  'Contador Público',
] as const;

export const TECNM_MORELIA_DEPARTMENTS = [
  'Departamento de Sistemas y Computación',
  'Departamento de Ciencias Básicas',
  'Departamento de Ingeniería Eléctrica y Electrónica',
  'Departamento de Metal Mecánica',
  'Departamento de Ingeniería Industrial',
  'Departamento de Ingeniería Química y Bioquímica',
  'Departamento de Ciencias Económico-Administrativas',
  'División de Estudios Profesionales',
  'División de Estudios de Posgrado e Investigación',
  'Departamento de Desarrollo Académico',
] as const;

export const INSTITUTIONAL_DOMAIN = '@morelia.tecnm.mx';

/** Puntos de referencia oficiales del TecNM Campus Morelia (Sprint 2) */
export interface CampusPointOption {
  key: string;
  name: string;
  shortName: string;
  description: string;
  lat: number;
  lng: number;
}

export const CAMPUS_REFERENCE_POINTS: readonly CampusPointOption[] = [
  {
    key: 'campus_1',
    name: 'Campus 1 (Central - Av. Tecnológico)',
    shortName: 'Campus 1',
    description: 'Av. Tecnológico #1500, Lomas de Santiaguito',
    lat: 19.721700,
    lng: -101.185800,
  },
  {
    key: 'campus_2',
    name: 'Campus 2',
    shortName: 'Campus 2',
    description: 'Camino de la Arboleda s/n, San José de la Huerta',
    lat: 19.688500,
    lng: -101.240500,
  },
  {
    key: 'metalurgia',
    name: 'Metalurgia (Unidad Morelia)',
    shortName: 'Metalurgia',
    description: 'Área de Metalurgia y Materiales, TecNM',
    lat: 19.724000,
    lng: -101.187000,
  },
] as const;

/** Zonas representativas de Morelia para filtro de proximidad */
export interface ZoneOption {
  name: string;
  lat: number;
  lng: number;
}

export const MORELIA_ZONES: readonly ZoneOption[] = [
  { name: 'Centro Histórico (Catedral)', lat: 19.7024, lng: -101.1922 },
  { name: 'Plaza Las Américas (Camelinas)', lat: 19.7039, lng: -101.1924 },
  { name: 'Altozano (Glorieta Papa)', lat: 19.6720, lng: -101.1650 },
  { name: 'Plaza Fiesta Camelinas', lat: 19.6882, lng: -101.1738 },
  { name: 'Estadio Morelos / Libramiento Norte', lat: 19.7275, lng: -101.2310 },
  { name: 'Monumento a Lázaro Cárdenas', lat: 19.7028, lng: -101.2065 },
  { name: 'Poliforum Morelia', lat: 19.7270, lng: -101.1780 },
  { name: 'Villas del Pedregal', lat: 19.7050, lng: -101.3050 },
  { name: 'Tarímbaro (Entronque)', lat: 19.7900, lng: -101.1700 },
] as const;

/** Colores comunes de vehículos */
export const COMMON_VEHICLE_COLORS = [
  { name: 'Blanco', hex: '#FFFFFF', border: '#CBD5E1' },
  { name: 'Gris', hex: '#64748B', border: '#475569' },
  { name: 'Plata', hex: '#CBD5E1', border: '#94A3B8' },
  { name: 'Negro', hex: '#1E293B', border: '#0F172A' },
  { name: 'Rojo', hex: '#DC2626', border: '#991B1B' },
  { name: 'Azul', hex: '#2563EB', border: '#1D4ED8' },
  { name: 'Guinda', hex: '#6B1736', border: '#4F0F27' },
  { name: 'Verde', hex: '#16A34A', border: '#15803D' },
  { name: 'Amarillo', hex: '#EAB308', border: '#CA8A04' },
  { name: 'Café', hex: '#78350F', border: '#451A03' },
] as const;

/** Paleta visual extendida para selector de color 'Otro' */
export const EXTENDED_COLOR_PALETTE = [
  '#F87171', '#FB923C', '#FBBF24', '#A3E635', '#34D399', '#22D3EE',
  '#38BDF8', '#60A5FA', '#818CF8', '#A78BFA', '#C084FC', '#F472B6',
  '#FB7185', '#9CA3AF', '#D1D5DB', '#78716C', '#0D9488', '#0284C7',
];
