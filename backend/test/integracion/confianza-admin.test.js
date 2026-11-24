'use strict';
/**
 * Módulo 3.1.5 · Confianza, seguridad y administración.
 * Calificaciones (puntuación definitiva, comentario editable con vigencia de 30 días,
 * recordatorio único), reportes, contacto de emergencia, documentos y panel de administración.
 */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('confianza, seguridad y administración', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const storage = require('../../src/shared/storage');
  const mailer = require('../../src/shared/mailer');
  const correos = require('../../src/modules/notificaciones/correos.service');
  const enviarOriginal = mailer.enviarSeguro;
  mailer.enviarSeguro = async () => true;
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => {
    await correos.esperar();
    mailer.enviarSeguro = enviarOriginal;
    await ctx.limpiar(); await api.cerrar(); await pool.end();
  });

  const conductor = await ctx.usuario({ nombre: 'Conductor Confianza' });
  const ana = await ctx.usuario({ nombre: 'Ana Pasajera' });
  const beto = await ctx.usuario({ nombre: 'Beto Pasajero' });
  const extrano = await ctx.usuario({ nombre: 'Persona Ajena' });
  const solicitante = await ctx.usuario({ nombre: 'Solo Solicitó' });
  const admin = await ctx.usuario({ nombre: 'Admin Confianza', rol: 'admin' });
  const veh = await ctx.vehiculo(conductor.id);

  const viaje = await ctx.viaje(conductor.id, veh.id, { minutos: 300, asientos: 3 });
  for (const p of [ana, beto]) {
    const r = await api.pedir('POST', `/api/viajes/${viaje.id}/reservas`, { token: p.token });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await api.pedir('PATCH', `/api/reservas/${r.body.id}`, { token: conductor.token, body: { action: 'accept' } })).status, 200);
  }
  assert.equal((await api.pedir('POST', `/api/viajes/${viaje.id}/reservas`, { token: solicitante.token })).status, 201);
  const finalizar = () => pool.query(
    `UPDATE viaje SET salida_en = now() - interval '1 hour', estado = 'finalizado', finalizado_en = now() WHERE id = $1`, [viaje.id]);

  let calAna;

  await t.test('participantes: cada quien ve a su contraparte; ajenos → 404', async () => {
    const c = await api.pedir('GET', `/api/viajes/${viaje.id}/participantes`, { token: conductor.token });
    assert.equal(c.status, 200);
    assert.equal(c.body.myRole, 'driver');
    assert.deepEqual(c.body.participants.map((p) => p.user.fullName).sort(), ['Ana Pasajera', 'Beto Pasajero']);
    assert.ok(c.body.participants.every((p) => p.canRate === false), 'antes de finalizar no se califica');
    const a = await api.pedir('GET', `/api/viajes/${viaje.id}/participantes`, { token: ana.token });
    assert.deepEqual(a.body.participants.map((p) => p.role), ['driver']);
    assert.equal((await api.pedir('GET', `/api/viajes/${viaje.id}/participantes`, { token: extrano.token })).status, 404);
  });

  await t.test('calificar: solo viajes finalizados; definitiva y sin duplicados', async () => {
    const antes = await api.pedir('POST', '/api/calificaciones', { token: ana.token, body: { tripId: viaje.id, ratedUserId: conductor.id, score: 5 } });
    assert.equal(antes.status, 409);
    assert.equal(antes.body.error, 'VIAJE_NO_FINALIZADO');
    await finalizar();

    const r = await api.pedir('POST', '/api/calificaciones', {
      token: ana.token, body: { tripId: viaje.id, ratedUserId: conductor.id, score: 5, comment: '  Muy puntual y amable ' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.score, 5);
    assert.equal(r.body.comment, 'Muy puntual y amable');
    assert.equal(r.body.canEditComment, true);
    calAna = r.body;

    const dup = await api.pedir('POST', '/api/calificaciones', { token: ana.token, body: { tripId: viaje.id, ratedUserId: conductor.id, score: 1 } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'YA_CALIFICADO');

    const entrePasajeros = await api.pedir('POST', '/api/calificaciones', { token: ana.token, body: { tripId: viaje.id, ratedUserId: beto.id, score: 3 } });
    assert.equal(entrePasajeros.status, 403);
    assert.equal((await api.pedir('POST', '/api/calificaciones', { token: extrano.token, body: { tripId: viaje.id, ratedUserId: conductor.id, score: 3 } })).status, 404);
    assert.equal((await api.pedir('POST', '/api/calificaciones', { token: ana.token, body: { tripId: viaje.id, ratedUserId: conductor.id, score: 7 } })).status, 422);

    // Conductor → pasajero, sin comentario (reciprocidad).
    const c = await api.pedir('POST', '/api/calificaciones', { token: conductor.token, body: { tripId: viaje.id, ratedUserId: ana.id, score: 4 } });
    assert.equal(c.status, 201);
    assert.equal(c.body.comment, null);
    assert.equal(c.body.canAddComment, true);
  });

  await t.test('la base de datos impide cambiar o borrar la puntuación', async () => {
    await assert.rejects(pool.query('UPDATE calificacion SET puntaje = 1 WHERE id = $1', [calAna.id]), /CALIFICACION_DEFINITIVA/);
    await assert.rejects(pool.query('DELETE FROM calificacion WHERE id = $1', [calAna.id]), /CALIFICACION_DEFINITIVA/);
  });

  await t.test('comentario: solo su autor lo edita o borra; la puntuación se conserva', async () => {
    const otro = await api.pedir('PATCH', `/api/calificaciones/${calAna.id}/comentario`, { token: conductor.token, body: { comment: 'Hackeo' } });
    assert.equal(otro.status, 404);
    const e = await api.pedir('PATCH', `/api/calificaciones/${calAna.id}/comentario`, { token: ana.token, body: { comment: 'Puntual, buena música' } });
    assert.equal(e.status, 200);
    assert.equal(e.body.comment, 'Puntual, buena música');
    assert.equal(e.body.score, 5);
    assert.ok(e.body.commentEditedAt);
    assert.equal((await api.pedir('PATCH', `/api/calificaciones/${calAna.id}/comentario`, { token: ana.token, body: { comment: '  ' } })).status, 422);

    const d = await api.pedir('DELETE', `/api/calificaciones/${calAna.id}/comentario`, { token: ana.token });
    assert.equal(d.status, 200);
    assert.equal(d.body.comment, null);
    assert.equal(d.body.score, 5, 'borrar el comentario no borra la calificación');
    assert.equal((await api.pedir('DELETE', `/api/calificaciones/${calAna.id}/comentario`, { token: ana.token })).status, 409);

    const nuevo = await api.pedir('PATCH', `/api/calificaciones/${calAna.id}/comentario`, { token: ana.token, body: { comment: 'Lo recomiendo' } });
    assert.equal(nuevo.status, 200);
    assert.equal(nuevo.body.comment, 'Lo recomiendo');
  });

  await t.test('vigencia de 30 días: el comentario deja de mostrarse y no se edita; las estrellas se quedan', async () => {
    await pool.query(`UPDATE calificacion SET comentario_en = now() - interval '31 days' WHERE id = $1`, [calAna.id]);
    const r = await api.pedir('GET', '/api/me/calificaciones', { token: conductor.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.commentRetentionDays, 30);
    assert.equal(r.body.summary.count, 1);
    assert.equal(r.body.summary.average, 5);
    assert.equal(r.body.items[0].comment, null);
    assert.equal(r.body.items[0].commentExpired, true);
    assert.equal(r.body.items[0].rater.fullName, 'Ana Pasajera');
    const e = await api.pedir('PATCH', `/api/calificaciones/${calAna.id}/comentario`, { token: ana.token, body: { comment: 'Otra vez' } });
    assert.equal(e.status, 409);
    assert.equal(e.body.error, 'COMENTARIO_VENCIDO');
    const dadas = await api.pedir('GET', '/api/me/calificaciones/dadas', { token: ana.token });
    assert.equal(dadas.body.items[0].canEditComment, false);
  });

  await t.test('recordatorio único: aparece una vez y no vuelve', async () => {
    const p = await api.pedir('GET', '/api/calificaciones/pendientes', { token: beto.token });
    assert.equal(p.status, 200);
    assert.equal(p.body.items.length, 1);
    assert.equal(p.body.items[0].toRate[0].fullName, 'Conductor Confianza');
    // El conductor ya calificó a alguien en ese viaje: cuenta como atendido, no se le insiste.
    assert.equal((await api.pedir('GET', '/api/calificaciones/pendientes', { token: conductor.token })).body.items.length, 0);
    const part = await api.pedir('GET', `/api/viajes/${viaje.id}/participantes`, { token: conductor.token });
    assert.equal(part.body.participants.find((x) => x.user.id === beto.id).canRate, true, 'pero aún puede calificar a Beto');
    // Ana ya calificó → sin recordatorio.
    assert.equal((await api.pedir('GET', '/api/calificaciones/pendientes', { token: ana.token })).body.items.length, 0);

    assert.equal((await api.pedir('POST', `/api/calificaciones/recordatorios/${viaje.id}`, { token: beto.token })).status, 200);
    assert.equal((await api.pedir('GET', '/api/calificaciones/pendientes', { token: beto.token })).body.items.length, 0);
    // Beto aún puede calificar después de descartar el recordatorio.
    const r = await api.pedir('POST', '/api/calificaciones', { token: beto.token, body: { tripId: viaje.id, ratedUserId: conductor.id, score: 3 } });
    assert.equal(r.status, 201);
  });

  await t.test('reportes: validación, relación con el viaje y sin duplicados', async () => {
    const base = { reportedUserId: conductor.id, tripId: viaje.id, reason: 'incumplimiento_acuerdos', description: 'No respetó el punto de encuentro acordado.' };
    const v = await api.pedir('POST', '/api/reportes', { token: ana.token, body: { ...base, reason: 'otro', reasonOther: ' ', description: '   ' } });
    assert.equal(v.status, 422);
    assert.ok(v.body.fields.reasonOther && v.body.fields.description);

    const r = await api.pedir('POST', '/api/reportes', { token: ana.token, body: base });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.message, /Recibimos tu reporte/);
    assert.equal((await api.pedir('POST', '/api/reportes', { token: ana.token, body: base })).body.error, 'REPORTE_DUPLICADO');
    assert.equal((await api.pedir('POST', '/api/reportes', { token: extrano.token, body: base })).status, 403);
    // El conductor puede reportar a quien solo solicitó lugar.
    const s = await api.pedir('POST', '/api/reportes', {
      token: conductor.token, body: { reportedUserId: solicitante.id, tripId: viaje.id, reason: 'otro', reasonOther: 'Mensajes insistentes', description: 'Me escribió muchas veces fuera de la app.' },
    });
    assert.equal(s.status, 201);
    const yo = await api.pedir('GET', `/api/viajes/${viaje.id}/participantes`, { token: ana.token });
    assert.equal(yo.body.participants[0].alreadyReported, true);
  });

  await t.test('contacto de emergencia: registrar, consultar, editar y validar', async () => {
    assert.deepEqual((await api.pedir('GET', '/api/me/contacto-emergencia', { token: ana.token })).body, { contact: null });
    const mal = await api.pedir('PUT', '/api/me/contacto-emergencia', { token: ana.token, body: { name: 'Mamá', phone: '443 12', relationship: 'otro' } });
    assert.equal(mal.status, 422);
    assert.ok(mal.body.fields.phone && mal.body.fields.relationshipOther);
    const ok = await api.pedir('PUT', '/api/me/contacto-emergencia', { token: ana.token, body: { name: 'Rosa Pérez', phone: '+52 (443) 123-4567', relationship: 'madre' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.contact.phone, '4431234567');
    assert.equal(ok.body.contact.relationshipLabel, 'Madre');
    const ed = await api.pedir('PUT', '/api/me/contacto-emergencia', { token: ana.token, body: { name: 'Rosa Pérez', phone: '4439876543', relationship: 'otro', relationshipOther: 'Tutora' } });
    assert.equal(ed.body.contact.relationshipLabel, 'Tutora');
    assert.equal((await api.pedir('GET', '/api/me/contacto-emergencia', { token: beto.token })).body.contact, null, 'cada quien ve solo el suyo');
  });

  await t.test('panel: solo administradores', async () => {
    for (const ruta of ['/api/admin/resumen', '/api/admin/reportes', '/api/admin/documentos', '/api/admin/usuarios']) {
      assert.equal((await api.pedir('GET', ruta, { token: ana.token })).status, 403, ruta);
      assert.equal((await api.pedir('GET', ruta)).status, 401, ruta);
    }
    const r = await api.pedir('GET', '/api/admin/resumen', { token: admin.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.recurrentThreshold, 6);
    assert.ok(r.body.users.total >= 6);
  });

  await t.test('reportes en el panel: filtros de lectura/atención y conteo histórico de recurrentes', async () => {
    // Beto acumula 6 reportes históricos de 6 personas (sin viaje, insertados directo).
    const reportantes = [ana, conductor, extrano, solicitante, admin, await ctx.usuario({ nombre: 'Sexto Reportante' })];
    const ids = [];
    const esRecurrente = async () => (await api.pedir('GET', '/api/admin/reportes/recurrentes', { token: admin.token }))
      .body.items.some((x) => x.user.id === beto.id);
    for (const [i, rp] of reportantes.entries()) {
      if (i === 5) assert.equal(await esRecurrente(), false, 'con 5 reportes todavía no es recurrente');
      const { rows } = await pool.query(
        `INSERT INTO reporte (reportante_id, usuario_reportado_id, motivo, descripcion, creado_en)
         VALUES ($1, $2, 'conducta_inapropiada', 'Descripción de prueba del reporte', now() - make_interval(mins => $3)) RETURNING id`,
        [rp.id, beto.id, 60 - i],
      );
      ids.push(rows[0].id);
    }
    assert.equal(await esRecurrente(), true, 'con 6 sí aparece');

    // Leer y atender 2 de ellos: siguen contando para recurrentes, pero salen de "más recientes".
    for (const id of ids.slice(0, 2)) {
      const u = await api.pedir('PATCH', `/api/admin/reportes/${id}`, { token: admin.token, body: { read: true, status: 'resolved', note: 'Atendido en prueba' } });
      assert.equal(u.status, 200);
      assert.equal(u.body.read, true);
      assert.equal(u.body.attended, true);
    }
    // Uno leído pero sin atender: sigue en "más recientes" y en "leídos".
    assert.equal((await api.pedir('PATCH', `/api/admin/reportes/${ids[2]}`, { token: admin.token, body: { read: true } })).body.attended, false);

    const rec = await api.pedir('GET', '/api/admin/reportes/recurrentes', { token: admin.token });
    const b = rec.body.items.find((x) => x.user.id === beto.id);
    assert.equal(b.totalReports, 6, 'el conteo incluye leídos y atendidos');
    assert.equal(b.unreadReports, 3);

    const lista = async (filter) => (await api.pedir('GET', `/api/admin/reportes?filter=${filter}&reportedUserId=${beto.id}`, { token: admin.token })).body.items.map((x) => x.id);
    const recientes = await lista('recent');
    assert.equal(recientes.length, 4);
    assert.ok(!recientes.includes(ids[0]) && !recientes.includes(ids[1]));
    assert.deepEqual(recientes, [...ids.slice(2)].reverse(), 'del más nuevo al más antiguo');
    assert.deepEqual(await lista('oldest'), ids.slice(2), 'del más antiguo al más nuevo');
    assert.deepEqual((await lista('read')).sort(), ids.slice(0, 3).sort());
    assert.deepEqual((await lista('unread')).sort(), ids.slice(3).sort());
    assert.equal((await lista('all')).length, 6, 'historial completo');

    const det = await api.pedir('GET', `/api/admin/reportes/${ids[3]}`, { token: admin.token });
    assert.equal(det.body.reportedUser.totalReports, 6);
    assert.equal(det.body.reporter.fullName, 'Solo Solicitó');
    assert.equal((await api.pedir('PATCH', `/api/admin/reportes/${ids[3]}`, { token: admin.token, body: { status: 'nope' } })).status, 422);
  });

  await t.test('documentos: rechazo con comentario, reenvío y nueva revisión', async () => {
    const pdf = Buffer.from('%PDF-1.4\n% prueba\n');
    const key = await storage.guardar(pdf, { carpeta: 'documentos', mime: 'application/pdf' });
    const { rows } = await pool.query(
      `INSERT INTO documento_usuario (usuario_id, tipo, nombre_archivo, mime_type, tamano_bytes, storage_key)
       VALUES ($1, 'reticula_academica', 'reticula.pdf', 'application/pdf', $2, $3) RETURNING id`,
      [ana.id, pdf.length, key],
    );
    const docId = rows[0].id;

    const l = await api.pedir('GET', `/api/admin/documentos?status=pending&q=Ana%20Pasajera`, { token: admin.token });
    assert.equal(l.status, 200);
    const item = l.body.items.find((d) => d.id === docId);
    assert.equal(item.owner.fullName, 'Ana Pasajera');
    assert.equal(item.status, 'pending');

    // URL firmada: abre el archivo sin header de sesión; alterada → 404.
    const archivo = await fetch(item.viewUrl.replace(/^https?:\/\/[^/]+/, api.base));
    assert.equal(archivo.status, 200);
    assert.equal(archivo.headers.get('content-type'), 'application/pdf');
    assert.equal((await fetch(item.viewUrl.replace(/^https?:\/\/[^/]+/, api.base).replace(/sig=.{4}/, 'sig=AAAA'))).status, 404);

    assert.equal((await api.pedir('PATCH', `/api/admin/documentos/${docId}`, { token: admin.token, body: { action: 'reject' } })).status, 422);
    const rej = await api.pedir('PATCH', `/api/admin/documentos/${docId}`, {
      token: admin.token, body: { action: 'reject', reason: 'El documento no es legible; sube una versión más clara.' },
    });
    assert.equal(rej.status, 200);
    assert.equal(rej.body.status, 'rejected');
    assert.equal((await api.pedir('PATCH', `/api/admin/documentos/${docId}`, { token: admin.token, body: { action: 'approve' } })).body.error, 'DOCUMENTO_YA_REVISADO');

    const noti = await api.pedir('GET', '/api/me/notificaciones', { token: ana.token });
    assert.ok(noti.body.items.some((n) => n.type === 'documento_rechazado' && /no es legible/.test(n.message)));

    let mios = await api.pedir('GET', '/api/me/documentos', { token: ana.token });
    assert.equal(mios.body.canUpload, true);
    assert.equal(mios.body.items[0].rejectionReason, 'El documento no es legible; sube una versión más clara.');

    // Reenvío (multipart): queda pendiente y el rechazado se conserva como historial.
    const form = new FormData();
    form.append('document', new Blob([pdf], { type: 'application/pdf' }), 'reticula-nueva.pdf');
    const subir = () => fetch(`${api.base}/api/me/documentos`, { method: 'POST', headers: { Authorization: `Bearer ${ana.token}` }, body: form });
    const up = await subir();
    assert.equal(up.status, 201, await up.clone().text());
    const nuevo = await up.json();
    assert.equal(nuevo.status, 'pending');
    assert.equal(nuevo.fileName, 'reticula-nueva.pdf');
    assert.equal((await subir()).status, 409, 'no se reenvía mientras está en revisión');
    mios = await api.pedir('GET', '/api/me/documentos', { token: ana.token });
    assert.deepEqual(mios.body.items.map((d) => d.status), ['pending', 'rejected']);
    assert.equal(mios.body.canUpload, false);

    const ap = await api.pedir('PATCH', `/api/admin/documentos/${nuevo.id}`, { token: admin.token, body: { action: 'approve' } });
    assert.equal(ap.body.status, 'approved');
    for (const d of (await pool.query('SELECT storage_key FROM documento_usuario WHERE usuario_id = $1', [ana.id])).rows) await storage.eliminar(d.storage_key);
  });

  await t.test('usuarios: el administrador suspende y reactiva (nunca automático)', async () => {
    const l = await api.pedir('GET', `/api/admin/usuarios?q=Beto`, { token: admin.token });
    const b = l.body.items.find((u) => u.id === beto.id);
    assert.equal(b.reportsReceived, 6);
    assert.equal(b.recurrent, true);
    assert.equal(b.status, 'active', 'acumular reportes no suspende');

    assert.equal((await api.pedir('PATCH', `/api/admin/usuarios/${admin.id}`, { token: admin.token, body: { action: 'suspend' } })).status, 409);
    const s = await api.pedir('PATCH', `/api/admin/usuarios/${beto.id}`, { token: admin.token, body: { action: 'suspend' } });
    assert.equal(s.body.status, 'suspended');
    assert.equal((await api.pedir('GET', '/api/me', { token: beto.token })).status, 403);
    const a = await api.pedir('PATCH', `/api/admin/usuarios/${beto.id}`, { token: admin.token, body: { action: 'activate' } });
    assert.equal(a.body.status, 'active');
    const cal = await api.pedir('GET', `/api/admin/usuarios/${conductor.id}/calificaciones`, { token: admin.token });
    assert.equal(cal.body.summary.count, 2);
  });
});
