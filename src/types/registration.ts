export type UserType = 'alumno' | 'maestro';

export interface AttachedFile {
  name: string;
  size?: number; // size in bytes
  uri: string;
  mimeType?: string;
  lastModified?: number;
}

export interface RegistrationFormData {
  userType: UserType | null;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
  // Specific to Alumno
  career: string;
  academicCurriculumDoc: AttachedFile | null; // Retícula académica vigente
  // Specific to Maestro
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
