'use strict';
/**
 * Mapper del módulo Notificaciones.
 *   - toNotificacionDTO: fila de BD → JSON para el cliente
 *   - componer: arma título y mensaje de cada aviso (función pura, con pruebas unitarias)
 */

const TIPOS = Object.freeze([
  'solicitud_recibida', 'solicitud_aceptada', 'solicitud_rechazada',
  'solicitud_cancelada', 'lugar_cancelado', 'viaje_cancelado',
  'viaje_lleno', 'lugar_liberado',
]);

/** Avisos de la revisión de documentos (no dependen de un viaje). */
const TIPOS_DOCUMENTO = Object.freeze(['documento_aprobado', 'documento_rechazado']);

/** Avisos que el cliente debe destacar (cancelaciones y rechazos). */
const TIPOS_CRITICOS = Object.freeze(['viaje_cancelado', 'lugar_cancelado', 'solicitud_cancelada', 'solicitud_rechazada', 'documento_rechazado']);

const formatoSalida = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "Plaza Las Américas → Campus 1 (jue 12 nov, 07:30 a.m.)" */
function describirViaje(ctx) {
  return `${ctx.origen_texto} → ${ctx.destino_texto} (${formatoSalida.format(new Date(ctx.salida_en))})`;
}

const recortar = (txt, max) => (txt.length > max ? `${txt.slice(0, max - 1)}…` : txt);

/**
 * @param {string} tipo  uno de TIPOS
 * @param {{ origen_texto: string, destino_texto: string, salida_en: Date|string,
 *           conductor_nombre?: string, pasajero_nombre?: string }} ctx
 * @param {{ tardia?: boolean }} [extra]
 * @returns {{ titulo: string, mensaje: string }}
 */
function componer(tipo, ctx, { tardia = false } = {}) {
  const viaje = describirViaje(ctx);
  let titulo;
  let mensaje;
  switch (tipo) {
    case 'solicitud_recibida':
      titulo = 'Nueva solicitud de lugar';
      mensaje = `${ctx.pasajero_nombre} quiere unirse a tu viaje ${viaje}. Acéptala o recházala en Solicitudes.`;
      break;
    case 'solicitud_aceptada':
      titulo = '¡Tu lugar está confirmado!';
      mensaje = `${ctx.conductor_nombre} aceptó tu solicitud para el viaje ${viaje}. Ya puedes ver las placas y el teléfono del conductor.`;
      break;
    case 'solicitud_rechazada':
      titulo = 'Solicitud rechazada';
      mensaje = `${ctx.conductor_nombre} no pudo aceptar tu solicitud para el viaje ${viaje}. Busca otro viaje disponible.`;
      break;
    case 'solicitud_cancelada':
      titulo = 'Solicitud retirada';
      mensaje = `${ctx.pasajero_nombre} retiró su solicitud pendiente para tu viaje ${viaje}.`;
      break;
    case 'lugar_cancelado':
      titulo = tardia ? '⚠ Cancelación tardía de un pasajero' : 'Un pasajero canceló su lugar';
      mensaje = `${ctx.pasajero_nombre} canceló su lugar confirmado en tu viaje ${viaje}.`
        + (tardia ? ' Lo hizo con menos de 20 minutos de anticipación (RN-06).' : '')
        + ' El asiento quedó libre de nuevo.';
      break;
    case 'viaje_cancelado':
      titulo = '⚠ Viaje cancelado por el conductor';
      mensaje = `${ctx.conductor_nombre} canceló el viaje ${viaje}. Tu lugar quedó cancelado: busca otro viaje lo antes posible.`;
      break;
    case 'viaje_lleno':
      titulo = 'El viaje se llenó · quedas en lista de espera';
      mensaje = `El viaje ${viaje} ya no tiene lugares disponibles. Tu solicitud sigue en lista de espera: `
        + 'si alguien cancela te avisaremos. Mientras, puedes solicitar otro viaje a la misma hora.';
      break;
    case 'lugar_liberado':
      titulo = '¡Se liberó un lugar!';
      mensaje = `Alguien canceló en el viaje ${viaje}. Sigues en lista de espera y el conductor ya puede aceptarte.`;
      break;
    default:
      throw new Error(`Tipo de notificación desconocido: ${tipo}`);
  }
  return { titulo: recortar(titulo, 120), mensaje: recortar(mensaje, 400) };
}

/**
 * Aviso de la revisión de un documento.
 * @param {'documento_aprobado'|'documento_rechazado'} tipo
 * @param {{ tipoDocumento: string, motivo?: string|null }} ctx
 */
function componerDocumento(tipo, { tipoDocumento, motivo = null }) {
  if (tipo === 'documento_aprobado') {
    return { titulo: 'Documento aceptado', mensaje: recortar(`El administrador aceptó tu ${tipoDocumento}.`, 400) };
  }
  if (tipo === 'documento_rechazado') {
    return {
      titulo: '⚠ Documento rechazado',
      mensaje: recortar(`El administrador rechazó tu ${tipoDocumento}. Motivo: ${motivo}. Puedes enviar uno nuevo en Mi perfil → Mis documentos.`, 400),
    };
  }
  throw new Error(`Tipo de notificación desconocido: ${tipo}`);
}

function toNotificacionDTO(row) {
  return {
    id: row.id,
    type: row.tipo,
    title: row.titulo,
    message: row.mensaje,
    critical: TIPOS_CRITICOS.includes(row.tipo),
    read: row.leida,
    createdAt: row.creada_en,
    tripId: row.viaje_id,
    reservationId: row.reserva_id,
  };
}

module.exports = { componer, componerDocumento, toNotificacionDTO, describirViaje, TIPOS, TIPOS_DOCUMENTO, TIPOS_CRITICOS };
