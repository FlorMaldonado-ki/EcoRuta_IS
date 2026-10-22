'use strict';
/**
 * Acceso a datos del módulo Autenticación y perfil. Único lugar con SQL sobre
 * usuario, token_verificacion y documento_usuario (RNF-15).
 * Todas las funciones reciben `db` (pool o cliente de transacción).
 * Consultas siempre parametrizadas (RNF-10).
 */

const COLUMNAS_USUARIO = `u.id, u.institucion_id, u.nombre_completo, u.correo, u.hash_contrasena, u.tipo,
  u.carrera, u.departamento, u.telefono, u.rol, u.estado, u.verificado_en,
  u.intentos_fallidos, u.bloqueado_hasta, u.creado_en`;

const CON_CALIFICACION = `${COLUMNAS_USUARIO},
  (SELECT round(avg(c.puntaje)::numeric, 2) FROM calificacion c WHERE c.evaluado_id = u.id) AS calificacion_promedio,
  (SELECT count(*) FROM calificacion c WHERE c.evaluado_id = u.id) AS calificaciones`;

async function buscarPorCorreo(db, correo) {
  const { rows } = await db.query(`SELECT ${CON_CALIFICACION} FROM usuario u WHERE u.correo = $1`, [correo]);
  return rows[0] || null;
}

async function buscarPorId(db, id) {
  const { rows } = await db.query(`SELECT ${CON_CALIFICACION} FROM usuario u WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

async function existeCorreo(db, correo) {
  const { rowCount } = await db.query('SELECT 1 FROM usuario WHERE correo = $1', [correo]);
  return rowCount > 0;
}

async function insertarUsuario(db, u) {
  const { rows } = await db.query(
    `INSERT INTO usuario (institucion_id, nombre_completo, correo, hash_contrasena, tipo, carrera, departamento, acepto_terminos_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNAS_USUARIO.replace(/u\./g, '')}`,
    [u.institucion_id, u.nombre_completo, u.correo, u.hash_contrasena, u.tipo, u.carrera, u.departamento, u.acepto_terminos_en],
  );
  return rows[0];
}

async function insertarDocumento(db, d) {
  await db.query(
    `INSERT INTO documento_usuario (usuario_id, tipo, nombre_archivo, mime_type, tamano_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [d.usuario_id, d.tipo, d.nombre_archivo, d.mime_type, d.tamano_bytes, d.storage_key],
  );
}

/** Crea un token y elimina los anteriores sin usar del mismo tipo (RF-02: reenviar invalida el previo). */
async function crearToken(db, usuarioId, tipo, hash, vigenciaMin) {
  await db.query('DELETE FROM token_verificacion WHERE usuario_id = $1 AND tipo = $2 AND usado_en IS NULL', [usuarioId, tipo]);
  await db.query(
    `INSERT INTO token_verificacion (usuario_id, tipo, hash, expira_en)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [usuarioId, tipo, hash, vigenciaMin],
  );
}

/** Estado de un token sin consumirlo: 'valido' | 'expirado' | 'usado' | 'inexistente'. */
async function estadoToken(db, hash, tipo) {
  const { rows } = await db.query(
    `SELECT usuario_id,
            CASE WHEN usado_en IS NOT NULL THEN 'usado' WHEN expira_en <= now() THEN 'expirado' ELSE 'valido' END AS estado
       FROM token_verificacion WHERE hash = $1 AND tipo = $2`,
    [hash, tipo],
  );
  return rows[0] || { usuario_id: null, estado: 'inexistente' };
}

/** Marca el token como usado de forma atómica; devuelve usuario_id o null. */
async function consumirToken(db, hash, tipo) {
  const { rows } = await db.query(
    `UPDATE token_verificacion SET usado_en = now()
      WHERE hash = $1 AND tipo = $2 AND usado_en IS NULL AND expira_en > now()
      RETURNING usuario_id`,
    [hash, tipo],
  );
  return rows[0]?.usuario_id || null;
}

async function activarCuenta(db, usuarioId) {
  await db.query(
    `UPDATE usuario SET verificado_en = COALESCE(verificado_en, now()),
                        estado = CASE WHEN estado = 'pendiente' THEN 'activo' ELSE estado END
      WHERE id = $1`,
    [usuarioId],
  );
}

/** RNF-11: al 5.º fallo seguido, bloquea 15 minutos. Devuelve bloqueado_hasta (o null). */
async function registrarIntentoFallido(db, usuarioId) {
  const { rows } = await db.query(
    `UPDATE usuario
        SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= 5 THEN 0 ELSE intentos_fallidos + 1 END,
            bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= 5 THEN now() + interval '15 minutes' ELSE bloqueado_hasta END
      WHERE id = $1
      RETURNING bloqueado_hasta`,
    [usuarioId],
  );
  return rows[0]?.bloqueado_hasta || null;
}

async function registrarInicioExitoso(db, usuarioId) {
  await db.query(
    'UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1 AND (intentos_fallidos > 0 OR bloqueado_hasta IS NOT NULL)',
    [usuarioId],
  );
}

async function actualizarContrasena(db, usuarioId, hash) {
  await db.query(
    'UPDATE usuario SET hash_contrasena = $2, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1',
    [usuarioId, hash],
  );
}

const COLUMNAS_EDITABLES = new Set(['nombre_completo', 'carrera', 'departamento', 'telefono']);

async function actualizarPerfil(db, usuarioId, cambios) {
  const columnas = Object.keys(cambios).filter((c) => COLUMNAS_EDITABLES.has(c));
  if (columnas.length === 0) return;
  const sets = columnas.map((c, i) => `${c} = $${i + 2}`).join(', ');
  await db.query(`UPDATE usuario SET ${sets} WHERE id = $1`, [usuarioId, ...columnas.map((c) => cambios[c])]);
}

module.exports = {
  buscarPorCorreo, buscarPorId, existeCorreo, insertarUsuario, insertarDocumento,
  crearToken, estadoToken, consumirToken, activarCuenta,
  registrarIntentoFallido, registrarInicioExitoso, actualizarContrasena, actualizarPerfil,
};
