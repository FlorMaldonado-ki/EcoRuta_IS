'use strict';
/**
 * RF-20 · Correos de reservas y cancelaciones.
 *
 * Se llaman DESPUÉS del COMMIT, igual que los avisos en la app, y sin await:
 * el envío corre en segundo plano y la API responde de inmediato. Si el
 * servidor de correo falla, la operación ya quedó guardada y el error solo se
 * registra en el log (RNF-29).
 *
 *   solicitar lugar     → conductor
 *   aceptar / rechazar  → pasajero (aceptada: con el punto de encuentro)
 *   cancelar viaje      → cada pasajero con reserva vigente
 *   cancelar mi lugar   → conductor (indica si fue tardía)
 */
const { pool } = require('../../config/db');
const mailer = require('../../shared/mailer');
const plantillas = require('../../shared/mailer/plantillas');

/** Envíos en curso (para que las pruebas puedan esperarlos con `esperar()`). */
const enCurso = new Set();

function enSegundoPlano(nombre, fn) {
  const p = Promise.resolve()
    .then(fn)
    .catch((err) => console.error(`❌ [correos] no se pudo preparar el correo "${nombre}":`, err.message))
    .finally(() => enCurso.delete(p));
  enCurso.add(p);
  return p;
}

const enviar = (to, msg) => (to ? mailer.enviarEnSegundoPlano({ to, ...msg }) : Promise.resolve(false));

async function contextoReserva(reservaId) {
  const { rows } = await pool.query(
    `SELECT r.id AS reserva_id, r.estado, r.cancelacion_tardia, r.punto_union,
            v.id AS viaje_id, v.origen_texto, v.destino_texto, v.salida_en,
            c.nombre_completo AS conductor_nombre, c.correo AS conductor_correo, c.telefono AS conductor_telefono,
            p.nombre_completo AS pasajero_nombre, p.correo AS pasajero_correo
       FROM reserva r
       JOIN viaje   v ON v.id = r.viaje_id
       JOIN usuario c ON c.id = v.conductor_id
       JOIN usuario p ON p.id = r.pasajero_id
      WHERE r.id = $1`,
    [reservaId],
  );
  return rows[0] || null;
}

/** Pasajero solicitó lugar → correo al conductor. */
const alSolicitar = (reservaId) => enSegundoPlano('solicitud_recibida', async () => {
  const ctx = await contextoReserva(reservaId);
  if (ctx) await enviar(ctx.conductor_correo, plantillas.solicitudRecibida(ctx));
});

/** Conductor aceptó o rechazó → correo al pasajero. */
const alResponder = (reservaId) => enSegundoPlano('respuesta', async () => {
  const ctx = await contextoReserva(reservaId);
  if (ctx && ['aceptada', 'rechazada'].includes(ctx.estado)) await enviar(ctx.pasajero_correo, plantillas.solicitudRespondida(ctx));
});

/** Pasajero canceló su lugar o su solicitud → correo al conductor. */
const alCancelarReserva = (reservaId, estadoAnterior) => enSegundoPlano('cancelacion_reserva', async () => {
  const ctx = await contextoReserva(reservaId);
  if (ctx) await enviar(ctx.conductor_correo, plantillas.reservaCancelada(ctx, { eraAceptada: estadoAnterior === 'aceptada' }));
});

/**
 * Conductor canceló el viaje → correo a cada pasajero con reserva vigente.
 * @param {string} viajeId
 * @param {{ reservaId: string, pasajeroId: string }[]} afectados
 */
const alCancelarViaje = (viajeId, afectados) => enSegundoPlano('viaje_cancelado', async () => {
  if (!afectados.length) return;
  const { rows } = await pool.query(
    `SELECT v.origen_texto, v.destino_texto, v.salida_en, c.nombre_completo AS conductor_nombre,
            p.nombre_completo AS pasajero_nombre, p.correo AS pasajero_correo
       FROM viaje v
       JOIN usuario c ON c.id = v.conductor_id
       JOIN usuario p ON p.id = ANY($2::uuid[])
      WHERE v.id = $1`,
    [viajeId, afectados.map((a) => a.pasajeroId)],
  );
  await Promise.all(rows.map((ctx) => enviar(ctx.pasajero_correo, plantillas.viajeCancelado(ctx))));
});

/** Espera a que terminen los correos en curso (pruebas y apagado limpio). */
async function esperar() {
  while (enCurso.size) await Promise.allSettled([...enCurso]);
}

module.exports = { alSolicitar, alResponder, alCancelarReserva, alCancelarViaje, esperar };
