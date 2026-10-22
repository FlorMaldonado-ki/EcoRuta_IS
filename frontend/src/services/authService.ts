import { Platform } from 'react-native';
import { apiRequest } from './apiClient';
import type {
  LoginResponse,
  MessageResponse,
  RegisterResponse,
  UpdateProfileRequest,
  UserDTO,
} from '../types/api';
import type { AttachedFile, RegistrationFormData } from '../types/registration';

/** Adjunta el archivo como lo espera cada plataforma. */
function appendFile(fd: FormData, field: string, file: AttachedFile) {
  if (Platform.OS === 'web' && file.webFile) {
    fd.append(field, file.webFile, file.name);
    return;
  }
  // iOS/Android: React Native acepta { uri, name, type } dentro de FormData.
  fd.append(field, { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/pdf' } as unknown as Blob);
}

/** RF-01 · POST /api/auth/register (multipart/form-data). */
export function register(data: RegistrationFormData): Promise<RegisterResponse> {
  const fd = new FormData();
  fd.append('userType', data.userType ?? '');
  fd.append('fullName', data.fullName.trim());
  fd.append('email', data.email.trim().toLowerCase());
  fd.append('password', data.password);
  fd.append('confirmPassword', data.confirmPassword);
  fd.append('termsAccepted', String(data.termsAccepted));
  if (data.userType === 'alumno') fd.append('career', data.career);
  if (data.userType === 'maestro') fd.append('department', data.department);

  const doc = data.userType === 'maestro' ? data.scheduleDoc : data.academicCurriculumDoc;
  if (doc) appendFile(fd, 'document', doc); // el archivo va al final, después de los campos

  return apiRequest<RegisterResponse>('/api/auth/register', { formData: fd, token: null });
}

/** RF-03 · POST /api/auth/login */
export const login = (email: string, password: string) =>
  apiRequest<LoginResponse>('/api/auth/login', {
    body: { email: email.trim().toLowerCase(), password },
    token: null,
  });

/** RF-02 · reenviar enlace de verificación */
export const resendVerification = (email: string) =>
  apiRequest<MessageResponse>('/api/auth/resend-verification', { body: { email: email.trim().toLowerCase() }, token: null });

/** RF-04 · enviar enlace de recuperación */
export const forgotPassword = (email: string) =>
  apiRequest<MessageResponse>('/api/auth/forgot-password', { body: { email: email.trim().toLowerCase() }, token: null });

/** RF-05 · perfil */
export const getMe = () => apiRequest<UserDTO>('/api/me');
export const updateMe = (changes: UpdateProfileRequest) =>
  apiRequest<UserDTO>('/api/me', { method: 'PATCH', body: changes });
