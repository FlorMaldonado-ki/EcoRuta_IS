import { API_TIMEOUT_MS, API_URL } from '../config/api';
import type { ApiErrorBody } from '../types/api';

/** Error normalizado: lo mismo si falló la red, el servidor o la validación. */
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;          // se envía como JSON
  formData?: FormData;     // se envía como multipart (no fijar Content-Type: lo pone fetch con el boundary)
  token?: string | null;
}

let authToken: string | null = null;
/** El App guarda aquí el token al iniciar sesión; todas las peticiones lo usan. */
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const token = opts.token !== undefined ? opts.token : authToken;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET'),
      headers,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
    });
  } catch (err) {
    const timeout = (err as Error)?.name === 'AbortError';
    throw new ApiError(0, timeout ? 'TIEMPO_AGOTADO' : 'SIN_CONEXION', timeout
      ? 'El servidor tardó demasiado en responder. Intenta de nuevo (puede estar despertando).'
      : `No se pudo conectar con el servidor (${API_URL}). Revisa tu conexión a internet.`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(
      res.status,
      body.error ?? `HTTP_${res.status}`,
      body.message ?? 'Ocurrió un error inesperado. Intenta de nuevo.',
      body.fields,
    );
  }
  return data as T;
}
