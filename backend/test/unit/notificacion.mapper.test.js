'use strict';
/** Notificaciones en la app: redacción de avisos y forma del DTO. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { componer, toNotificacionDTO, TIPOS, TIPOS_CRITICOS } = require('../../src/modules/notificaciones/notificacion.mapper');

const ctx = {
  origen_texto: 'Plaza Las Américas',
  destino_texto: 'Campus 1',
  salida_en: '2026-11-12T13:30:00.000Z', // 07:30 en Morelia
  conductor_nombre: 'Ana Gómez',
  pasajero_nombre: 'Carlos Ruiz',
};

test('cada tipo genera título y mensaje con el viaje y la hora local de Morelia', () => {
  for (const tipo of TIPOS) {
    const { titulo, mensaje } = componer(tipo, ctx);
    assert.ok(titulo.length > 0 && titulo.length <= 120, tipo);
    assert.ok(mensaje.length > 0 && mensaje.length <= 400, tipo);
    assert.match(mensaje, /Plaza Las Américas → Campus 1/, tipo);
    assert.match(mensaje, /07:30/, tipo);
  }
});

test('el aviso va dirigido con el nombre de la otra persona', () => {
  assert.match(componer('solicitud_recibida', ctx).mensaje, /^Carlos Ruiz/);
  assert.match(componer('lugar_cancelado', ctx).mensaje, /^Carlos Ruiz/);
  assert.match(componer('solicitud_aceptada', ctx).mensaje, /^Ana Gómez/);
  assert.match(componer('viaje_cancelado', ctx).mensaje, /^Ana Gómez/);
});

test('RN-06: la cancelación tardía de un lugar se marca en título y mensaje', () => {
  const normal = componer('lugar_cancelado', ctx);
  const tardia = componer('lugar_cancelado', ctx, { tardia: true });
  assert.doesNotMatch(normal.titulo, /tardía/);
  assert.match(tardia.titulo, /tardía/);
  assert.match(tardia.mensaje, /menos de 20 minutos/);
});

test('textos muy largos se recortan a los límites de la tabla', () => {
  const largo = { ...ctx, origen_texto: 'X'.repeat(500) };
  assert.ok(componer('viaje_cancelado', largo).mensaje.length <= 400);
});

test('tipo desconocido lanza error (nunca se inserta basura)', () => {
  assert.throws(() => componer('otro', ctx));
});

test('DTO: cancelaciones y rechazos salen como critical', () => {
  const fila = (tipo) => ({ id: 'n1', tipo, titulo: 't', mensaje: 'm', leida: false, creada_en: new Date(), viaje_id: 'v', reserva_id: 'r' });
  for (const tipo of TIPOS) {
    assert.equal(toNotificacionDTO(fila(tipo)).critical, TIPOS_CRITICOS.includes(tipo), tipo);
  }
  assert.equal(toNotificacionDTO(fila('viaje_cancelado')).critical, true);
  assert.equal(toNotificacionDTO(fila('solicitud_aceptada')).critical, false);
  assert.deepEqual(Object.keys(toNotificacionDTO(fila('viaje_cancelado'))).sort(),
    ['createdAt', 'critical', 'id', 'message', 'read', 'reservationId', 'title', 'tripId', 'type']);
});
