'use strict';
/** Validaciones puras del módulo Confianza (3.1.5). */
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../../src/modules/confianza/confianza.mapper');

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

const camposDe = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.fields;
  }
  return null;
};

test('calificación: estrellas de 1 a 5, comentario opcional', () => {
  assert.deepEqual(m.parseCalificacion({ tripId: UUID, ratedUserId: UUID2, score: 5 }),
    { viaje_id: UUID, evaluado_id: UUID2, puntaje: 5, comentario: null });
  assert.equal(m.parseCalificacion({ tripId: UUID, ratedUserId: UUID2, score: '3', comment: '   ' }).comentario, null);
  assert.equal(m.parseCalificacion({ tripId: UUID, ratedUserId: UUID2, score: 4, comment: '  Muy   puntual ' }).comentario, 'Muy puntual');
  for (const score of [0, 6, 2.5, 'cinco', null]) {
    assert.ok(camposDe(() => m.parseCalificacion({ tripId: UUID, ratedUserId: UUID2, score })).score, String(score));
  }
  assert.ok(camposDe(() => m.parseCalificacion({ tripId: UUID, ratedUserId: UUID2, score: 5, comment: 'x'.repeat(281) })).comment);
  assert.deepEqual(Object.keys(camposDe(() => m.parseCalificacion({})) || {}).sort(), ['ratedUserId', 'score', 'tripId']);
});

test('vigencia del comentario: 30 días desde que se publicó', () => {
  const publicado = new Date('2026-11-01T12:00:00Z');
  const fila = { comentario: 'Hola', comentario_en: publicado };
  assert.equal(m.comentarioVigente(fila, 30, new Date('2026-11-30T12:00:00Z')), true);
  assert.equal(m.comentarioVigente(fila, 30, new Date('2026-12-01T12:00:01Z')), false);
  assert.equal(m.comentarioVigente({ comentario: null, comentario_en: null }, 30), false);

  const recibida = m.toCalificacionRecibidaDTO({
    id: UUID, viaje_id: UUID, puntaje: 4, comentario: 'Hola', comentario_en: publicado, creada_en: publicado,
    evaluador_id: UUID2, evaluador_nombre: 'Ana', conductor_id: UUID2,
  }, 30, new Date('2026-12-15T00:00:00Z'));
  assert.equal(recibida.comment, null, 'vencido: ya no se muestra');
  assert.equal(recibida.commentExpired, true);
  assert.equal(recibida.score, 4, 'la puntuación se conserva');
  assert.equal(recibida.raterRole, 'driver');
});

test('reporte: todos los campos obligatorios y "Otro" exige especificar', () => {
  const base = { reportedUserId: UUID, tripId: UUID2, reason: 'acoso', description: 'Me habló de forma agresiva.' };
  assert.equal(m.parseReporte(base).motivo, 'acoso');
  assert.ok(camposDe(() => m.parseReporte({ ...base, reason: '' })).reason);
  assert.ok(camposDe(() => m.parseReporte({ ...base, reason: 'inventado' })).reason);
  assert.ok(camposDe(() => m.parseReporte({ ...base, description: '      ' })).description);
  assert.ok(camposDe(() => m.parseReporte({ ...base, description: 'corto' })).description);
  assert.ok(camposDe(() => m.parseReporte({ ...base, description: 'x'.repeat(1001) })).description);
  assert.ok(camposDe(() => m.parseReporte({ ...base, reason: 'otro', reasonOther: '   ' })).reasonOther);
  assert.equal(m.parseReporte({ ...base, reason: 'otro', reasonOther: ' Ruido  excesivo ' }).motivo_otro, 'Ruido excesivo');
  assert.equal(m.parseReporte({ ...base, reasonOther: 'ignorado' }).motivo_otro, null);
  assert.ok(camposDe(() => m.parseReporte({ ...base, tripId: undefined })).tripId);
});

test('teléfono de México: 10 dígitos con la LADA incluida', () => {
  assert.equal(m.normalizarTelefonoMx('443 123 4567'), '4431234567');
  assert.equal(m.normalizarTelefonoMx('(443) 123-45-67'), '4431234567');
  assert.equal(m.normalizarTelefonoMx('+52 443 123 4567'), '4431234567');
  assert.equal(m.normalizarTelefonoMx('524431234567'), '4431234567');
  assert.equal(m.normalizarTelefonoMx('443123456'), null, 'incompleto');
  assert.equal(m.normalizarTelefonoMx('44312345678'), null, '11 dígitos');
  assert.equal(m.normalizarTelefonoMx('443ABC4567'), null, 'letras');
  assert.equal(m.normalizarTelefonoMx('+1 443 123 4567'), null, 'otro país');
});

test('contacto de emergencia: parentesco de la lista y "Otro" especificado', () => {
  const ok = m.parseContacto({ name: 'María López', phone: '443-123-4567', relationship: 'madre' });
  assert.deepEqual(ok, { nombre: 'María López', telefono: '4431234567', parentesco: 'madre', parentesco_otro: null });
  assert.ok(camposDe(() => m.parseContacto({ name: 'María', phone: '4431234567', relationship: 'tia' })).relationship);
  assert.ok(camposDe(() => m.parseContacto({ name: 'María', phone: '4431234567', relationship: 'otro' })).relationshipOther);
  assert.equal(m.parseContacto({ name: 'Luis', phone: '4431234567', relationship: 'otro', relationshipOther: 'Tutor' }).parentesco_otro, 'Tutor');
  assert.ok(camposDe(() => m.parseContacto({ name: 'Luis', phone: '12345', relationship: 'padre' })).phone);
  assert.ok(camposDe(() => m.parseContacto({ name: '', phone: '', relationship: '' })).name);
});
