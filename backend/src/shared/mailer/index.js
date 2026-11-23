'use strict';
/**
 * Capa de envío de correo (RF-02, RF-04).
 *
 * MAIL_DRIVER:
 *   console → imprime el correo en la terminal (desarrollo, no envía nada).
 *   smtp    → envío real por SMTP con nodemailer. RECOMENDADO con Gmail + contraseña
 *             de aplicación: el correo sale firmado por Gmail (SPF/DKIM/DMARC válidos)
 *             y los servidores de Microsoft 365 del TecNM sí lo aceptan.
 *   memoria → guarda los correos en `bandeja` sin imprimir ni enviar (pruebas automatizadas).
 *   brevo   → API REST de Brevo. Solo es confiable si MAIL_FROM usa un dominio propio
 *             autenticado en Brevo; con @outlook.com / @gmail.com como remitente,
 *             Microsoft 365 lo descarta como suplantación aunque Brevo diga "delivered".
 */
const https = require('https');
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const plantillas = require('./plantillas');

const DRIVER = String(env.mail.driver || 'console').toLowerCase();
const NOMBRE_REMITENTE = 'EcoRuta Escolar';

/** Separa 'Nombre <correo@x>' o 'correo@x' en { name, email }. */
function parseRemitente(valor) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(valor || '');
  if (m) return { name: m[1].trim() || NOMBRE_REMITENTE, email: m[2].trim() };
  return { name: NOMBRE_REMITENTE, email: String(valor || '').trim() };
}

// ── Driver SMTP (nodemailer) ────────────────────────────────────────────────
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { host, port, secure, user, pass } = env.mail.smtp;
  if (!host || !user || !pass) {
    throw new Error('MAIL_DRIVER=smtp requiere SMTP_HOST, SMTP_USER y SMTP_PASS en .env');
  }
  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return transporter;
}

function remitenteSmtp() {
  const from = parseRemitente(env.mail.from);
  const user = env.mail.smtp.user;
  // Gmail/Outlook reescriben (o rechazan) un From distinto a la cuenta autenticada.
  if (user && from.email.toLowerCase() !== user.toLowerCase()) {
    return { name: from.name, address: user };
  }
  return { name: from.name, address: from.email };
}

async function enviarSmtp({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({ from: remitenteSmtp(), to, subject, html, text });
  console.log(`✅ [mailer] Correo enviado a ${to} vía SMTP (${env.mail.smtp.host}) id=${info.messageId}`);
  return true;
}

// ── Driver Brevo (API REST) ─────────────────────────────────────────────────
function enviarBrevo({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('MAIL_DRIVER=brevo requiere BREVO_API_KEY en .env');
  const sender = parseRemitente(env.mail.from);

  const data = JSON.stringify({
    sender,
    to: [{ email: to }],
    subject,
    htmlContent: html || `<p>${text}</p>`,
    ...(text ? { textContent: text } : {}),
  });

  const options = {
    hostname: 'api.brevo.com',
    port: 443,
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ [mailer] Correo aceptado por Brevo para ${to}.`);
          resolve(true);
        } else {
          reject(new Error(`Brevo respondió ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── API pública ─────────────────────────────────────────────────────────────
/** Correos "enviados" con MAIL_DRIVER=memoria (solo pruebas; se vacía con bandeja.length = 0). */
const bandeja = [];

async function enviar(msg) {
  switch (DRIVER) {
    case 'smtp': return enviarSmtp(msg);
    case 'brevo': return enviarBrevo(msg);
    case 'memoria': bandeja.push(msg); return true;
    default:
      console.log(`\n📧 [MODO CONSOLE] CORREO\nPara: ${msg.to}\nAsunto: ${msg.subject}\n\n${msg.text || msg.html}\n`);
      return true;
  }
}

/** No interrumpe el flujo si el correo falla: se registra y el usuario puede reenviar. */
async function enviarSeguro(msg) {
  try {
    await enviar(msg);
    return true;
  } catch (err) {
    console.error(`❌ [mailer] no se pudo enviar "${msg.subject}" a ${msg.to}:`, err.message);
    return false;
  }
}

/**
 * RF-20 / RNF-29 · Envío que NO bloquea la respuesta de la API: se agenda para
 * después del ciclo actual y cualquier error queda solo en el log. Usa
 * module.exports.enviarSeguro para que las pruebas puedan interceptarlo.
 * @returns {Promise<boolean>} se resuelve al terminar el intento (nunca rechaza)
 */
function enviarEnSegundoPlano(msg) {
  return new Promise((resolve) => {
    setImmediate(() => {
      Promise.resolve()
        .then(() => module.exports.enviarSeguro(msg))
        .then(resolve, (err) => {
          console.error(`❌ [mailer] error inesperado enviando "${msg.subject}":`, err.message);
          resolve(false);
        });
    });
  });
}

/** RF-02: enlace de verificación de correo. Devuelve true si se envió. */
function enviarVerificacion(to, nombre, enlace) {
  return enviarSeguro({ to, ...plantillas.verificacion(nombre, enlace) });
}

/** RF-04: enlace de recuperación de contraseña. Devuelve true si se envió. */
function enviarRecuperacion(to, nombre, enlace) {
  return enviarSeguro({ to, ...plantillas.recuperacion(nombre, enlace) });
}

/** Comprueba al arrancar que la configuración de correo funciona (solo registra). */
async function verificarConfiguracion() {
  if (DRIVER === 'smtp') {
    try {
      await getTransporter().verify();
      console.log(`[mailer] SMTP listo (${env.mail.smtp.host}) · remitente ${remitenteSmtp().address}`);
    } catch (err) {
      console.error(`❌ [mailer] SMTP no disponible (${env.mail.smtp.host}): ${err.message}`);
    }
  } else if (DRIVER === 'brevo') {
    const { email } = parseRemitente(env.mail.from);
    if (/@(outlook|hotmail|live|gmail|yahoo)\./i.test(email)) {
      console.warn(`⚠️  [mailer] Brevo con remitente ${email}: los correos a @tecnm.mx probablemente se descartarán. Usa MAIL_DRIVER=smtp con Gmail.`);
    }
  } else if (DRIVER === 'memoria') {
    console.log('[mailer] MAIL_DRIVER=memoria: los correos se guardan en memoria (pruebas).');
  } else {
    console.log('[mailer] MAIL_DRIVER=console: los correos solo se imprimen en la terminal.');
  }
}

module.exports = {
  enviar,
  enviarSeguro,
  enviarEnSegundoPlano,
  enviarVerificacion,
  enviarRecuperacion,
  verificarConfiguracion,
  plantillas,
  bandeja,
};
