'use strict';
/** SCRUM-69 · RF-20: plantillas de los 4 correos de reservas y cancelaciones. */
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../../src/shared/mailer/plantillas');

const base = {
  origen_texto: 'Plaza Las Américas', destino_texto: 'Campus 1',
  salida_en: '2026-11-24T13:30:00.000Z',
  conductor_nombre: 'Ana Conductora', pasajero_nombre: 'Carla <Pasajera>',
};

test('la fecha de salida se muestra en hora de Morelia', () => {
  assert.equal(p.fechaSalida(base.salida_en), 'martes, 24 de noviembre, 7:30 a.m.');
});

test('solicitud recibida: al conductor, con el nombre del pasajero y el viaje; HTML escapado', () => {
  const m = p.solicitudRecibida(base);
  assert.match(m.subject, /Nueva solicitud de Carla <Pasajera>/);
  assert.match(m.text, /Plaza Las Américas → Campus 1/);
  assert.match(m.html, /Carla &lt;Pasajera&gt;/);
  assert.doesNotMatch(m.html, /<Pasajera>/);
});

test('aceptada: incluye el punto exacto de encuentro con enlace al mapa y el teléfono', () => {
  const m = p.solicitudRespondida({
    ...base, estado: 'aceptada', conductor_telefono: '4431234567',
    punto_union: { tipo: 'conductor', nombre: 'OXXO Camelinas', lat: 19.69, lng: -101.18, nota: 'Frente a la entrada' },
  });
  assert.match(m.subject, /confirmado/);
  assert.match(m.text, /Punto de encuentro: OXXO Camelinas \(https:\/\/www\.openstreetmap\.org\/\?mlat=19\.69&mlon=-101\.18/);
  assert.match(m.text, /Nota: Frente a la entrada/);
  assert.match(m.html, /4431234567/);
});

test('rechazada: sin punto de encuentro ni teléfono', () => {
  const m = p.solicitudRespondida({ ...base, estado: 'rechazada', conductor_telefono: '4431234567' });
  assert.match(m.subject, /no fue aceptada/);
  assert.doesNotMatch(m.text, /Punto de encuentro|4431234567/);
});

test('viaje cancelado: aviso al pasajero', () => {
  const m = p.viajeCancelado(base);
  assert.match(m.text, /Ana Conductora canceló el viaje/);
});

test('cancelación del pasajero: distingue lugar/solicitud e indica si fue tardía', () => {
  const lugar = p.reservaCancelada({ ...base, cancelacion_tardia: true }, { eraAceptada: true });
  assert.match(lugar.subject, /canceló su lugar/);
  assert.match(lugar.text, /cancelación tardía/);
  assert.match(lugar.text, /Se liberó un asiento/);
  const solicitud = p.reservaCancelada({ ...base, cancelacion_tardia: false }, { eraAceptada: false });
  assert.match(solicitud.subject, /retiró su solicitud/);
  assert.doesNotMatch(solicitud.text, /tardía|liberó/);
});
