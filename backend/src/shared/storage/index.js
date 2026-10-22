'use strict';
/**
 * Capa de abstracción de almacenamiento de archivos (RNF-19).
 * La BD solo guarda `storage_key`; el archivo vive aquí.
 *   local      → carpeta ./uploads (desarrollo)
 *   cloudinary → recursos privados ("authenticated"), sin SDK: API REST firmada
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../../config/env');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');

const extension = (mime) => ({ 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[mime] || 'bin');

const local = {
  async guardar(buffer, { carpeta, mime }) {
    const key = `${carpeta}/${crypto.randomUUID()}.${extension(mime)}`;
    const destino = path.join(UPLOADS_DIR, key);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, buffer);
    return key;
  },
  async eliminar(key) {
    await fs.rm(path.join(UPLOADS_DIR, key), { force: true });
  },
};

const cloudinary = {
  firma(params) {
    const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    return crypto.createHash('sha1').update(base + env.storage.cloudinary.apiSecret).digest('hex');
  },
  async guardar(buffer, { carpeta, mime }) {
    const { cloudName, apiKey, apiSecret } = env.storage.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) throw new Error('Faltan CLOUDINARY_* en las variables de entorno.');
    const params = {
      folder: `ecoruta/${carpeta}`,
      public_id: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      type: 'authenticated', // no accesible por URL pública (RNF-12)
    };
    const form = new FormData();
    Object.entries(params).forEach(([k, v]) => form.append(k, String(v)));
    form.append('api_key', apiKey);
    form.append('signature', this.firma(params));
    form.append('file', new Blob([buffer], { type: mime }), `documento.${extension(mime)}`);
    const tipoRecurso = mime === 'application/pdf' ? 'raw' : 'image';
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${tipoRecurso}/upload`, { method: 'POST', body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(`Cloudinary: ${json.error?.message || res.status}`);
    return `${tipoRecurso}/${json.public_id}`;
  },
  async eliminar(key) {
    const { cloudName, apiKey } = env.storage.cloudinary;
    const [tipoRecurso, ...resto] = key.split('/');
    const params = { public_id: resto.join('/'), timestamp: Math.floor(Date.now() / 1000), type: 'authenticated' };
    const form = new FormData();
    Object.entries(params).forEach(([k, v]) => form.append(k, String(v)));
    form.append('api_key', apiKey);
    form.append('signature', this.firma(params));
    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${tipoRecurso}/destroy`, { method: 'POST', body: form });
  },
};

const drivers = { local, cloudinary };
const driver = drivers[env.storage.driver];
if (!driver) throw new Error(`STORAGE_DRIVER desconocido: ${env.storage.driver} (usa local | cloudinary)`);

/** Comprueba al arrancar que el almacenamiento está bien configurado (solo registra). */
async function verificarConfiguracion() {
  if (env.storage.driver === 'local') {
    console.log(`[storage] STORAGE_DRIVER=local: documentos en ${UPLOADS_DIR}`);
    return;
  }
  const { cloudName, apiKey, apiSecret } = env.storage.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('❌ [storage] Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET.');
    return;
  }
  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/ping`, { headers: { Authorization: `Basic ${auth}` } });
    if (res.ok) console.log(`[storage] Cloudinary listo (cuenta ${cloudName})`);
    else console.error(`❌ [storage] Cloudinary rechazó las credenciales (HTTP ${res.status}). Revisa CLOUDINARY_* en .env`);
  } catch (err) {
    console.error('❌ [storage] No se pudo conectar con Cloudinary:', err.message);
  }
}

module.exports = {
  verificarConfiguracion,
  /** @returns {Promise<string>} storage_key */
  guardar: (buffer, opciones) => driver.guardar(buffer, opciones),
  eliminar: (key) => driver.eliminar(key).catch((err) => console.error('[storage] no se pudo eliminar', key, err.message)),
};
