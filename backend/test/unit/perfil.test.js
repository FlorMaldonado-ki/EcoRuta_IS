'use strict';
/** SCRUM-45 · RF-05, RNF-09, RNF-12: lista blanca y validaciones de PATCH /api/me. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseActualizacionPerfil, toUsuarioDTO } = require('../../src/modules/auth/usuario.mapper');

const ctx = { carreras: ['Ingeniería Industrial'], departamentos: ['Departamento de Ciencias Básicas'] };
const alumno = { tipo: 'estudiante' };
const maestro = { tipo: 'docente' };

test('ignora email, userType, status, role y cualquier otro campo', () => {
  const cambios = parseActualizacionPerfil({ email: 'otro@gmail.com', userType: 'maestro', status: 'active', role: 'admin', hash_contrasena: 'x' }, alumno, ctx);
  assert.deepEqual(cambios, {});
});

test('normaliza el teléfono (+52, espacios, guiones) y permite borrarlo', () => {
  assert.deepEqual(parseActualizacionPerfil({ phone: '+52 (443) 123-4567' }, alumno, ctx), { telefono: '4431234567' });
  assert.deepEqual(parseActualizacionPerfil({ phone: '' }, alumno, ctx), { telefono: null });
  assert.deepEqual(parseActualizacionPerfil({ phone: null }, alumno, ctx), { telefono: null });
});

test('teléfono que no es de 10 dígitos o con letras → 422 en phone', () => {
  for (const phone of ['12345', '443-abc-1234', '44312345678901']) {
    assert.throws(() => parseActualizacionPerfil({ phone }, alumno, ctx), (e) => Boolean(e.status === 422 && Boolean(e.fields.phone)));
  }
});

test('nombre vacío o demasiado corto → 422; se recortan espacios dobles', () => {
  assert.throws(() => parseActualizacionPerfil({ fullName: '  ' }, alumno, ctx), (e) => Boolean(e.fields.fullName));
  assert.deepEqual(parseActualizacionPerfil({ fullName: '  Ana   López ' }, alumno, ctx), { nombre_completo: 'Ana López' });
});

test('carrera solo para alumno y del catálogo; departamento solo para maestro', () => {
  assert.deepEqual(parseActualizacionPerfil({ career: 'Ingeniería Industrial' }, alumno, ctx), { carrera: 'Ingeniería Industrial' });
  assert.throws(() => parseActualizacionPerfil({ career: 'Medicina' }, alumno, ctx), (e) => Boolean(e.fields.career));
  assert.throws(() => parseActualizacionPerfil({ department: 'Departamento de Ciencias Básicas' }, alumno, ctx), (e) => Boolean(e.fields.department));
  assert.deepEqual(parseActualizacionPerfil({ department: 'Departamento de Ciencias Básicas' }, maestro, ctx), { departamento: 'Departamento de Ciencias Básicas' });
});

test('el DTO del perfil nunca incluye hash ni contadores de bloqueo', () => {
  const dto = toUsuarioDTO({ id: '1', nombre_completo: 'Ana', correo: 'a@b.mx', tipo: 'estudiante', carrera: 'x', departamento: null,
    telefono: null, rol: 'usuario', estado: 'activo', verificado_en: new Date(), creado_en: new Date(),
    hash_contrasena: '$2a$secret', intentos_fallidos: 3, bloqueado_hasta: new Date() });
  const json = JSON.stringify(dto);
  assert.ok(!json.includes('secret') && !json.includes('intentos') && !json.includes('bloqueado'));
});
