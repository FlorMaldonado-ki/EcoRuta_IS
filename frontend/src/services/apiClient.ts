import { Platform } from 'react-native';
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
  formData?: FormData;     // se envía como multipart (no fijar Content-Type: lo pone el cliente con el boundary)
  token?: string | null;
}

interface RawResponse {
  status: number;
  ok: boolean;
  text: string;
}

let authToken: string | null = null;
/** El App guarda aquí el token al iniciar sesión; todas las peticiones lo usan. */
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

const errorTiempo = () =>
  new ApiError(0, 'TIEMPO_AGOTADO', 'El servidor tardó demasiado en responder. Intenta de nuevo (puede estar despertando).');
const errorConexion = () =>
  new ApiError(0, 'SIN_CONEXION', `No se pudo conectar con el servidor (${API_URL}). Revisa tu conexión a internet.`);

/**
 * Subida multipart en Android/iOS con XMLHttpRequest.
 * El fetch de Expo no acepta archivos como { uri, name, type } dentro de FormData y
 * falla antes de enviar ("Network request failed"); el XHR nativo de React Native sí.
 */
function enviarMultipartNativo(url: string, method: string, headers: Record<string, string>, form: FormData): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = API_TIMEOUT_MS;
    xhr.onload = () => resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, text: xhr.responseText ?? '' });
    xhr.ontimeout = () => reject(errorTiempo());
    xhr.onerror = () => {
      console.warn(`[api] ${method} ${url} falló en la subida (XHR status ${xhr.status})`);
      reject(errorConexion());
    };
    xhr.send(form);
  });
}

async function enviarFetch(url: string, init: RequestInit): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw errorTiempo();
    console.warn(`[api] ${init.method} ${url} falló:`, err);
    throw errorConexion();
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = opts.token !== undefined ? opts.token : authToken;
  const method = opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET');
  const url = `${API_URL}${path}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = opts.formData && Platform.OS !== 'web'
    ? await enviarMultipartNativo(url, method, headers, opts.formData)
    : await enviarFetch(url, {
        method,
        headers,
        body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      });

  let data: unknown = null;
  if (res.text) {
    try {
      data = JSON.parse(res.text);
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
