export type UserType = 'alumno' | 'maestro';

export interface AttachedFile {
  name: string;
  size?: number; // size in bytes
  uri: string;
  mimeType?: string;
  lastModified?: number;
  /** Solo en Expo Web: el File del navegador, necesario para subirlo con FormData. */
  webFile?: Blob;
}

export interface RegistrationFormData {
  userType: UserType | null;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
  // Solo alumno
  career: string;
  academicCurriculumDoc: AttachedFile | null; // Retícula académica vigente
  // Solo maestro
  department: string;
  scheduleDoc: AttachedFile | null; // Carga de materias u horario
}

export interface FormErrors {
  userType?: string;
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  termsAccepted?: string;
  career?: string;
  academicCurriculumDoc?: string;
  department?: string;
  scheduleDoc?: string;
}
