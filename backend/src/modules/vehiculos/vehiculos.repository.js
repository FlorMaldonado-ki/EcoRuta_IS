'use strict';
/** SQL del módulo Vehículos. Único lugar que escribe en la tabla vehiculo (RNF-15). */

const COLUMNAS = `id, usuario_id, tipo, marca, modelo, anio, color, placas, capacidad,
  declaracion_licencia_seguro, activo, creado_en, actualizado_en`;

async function listarPorUsuario(db, usuarioId, { incluirInactivos = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS} FROM vehiculo
      WHERE usuario_id = $1 AND ($2 OR activo)
      ORDER BY activo DESC, creado_en DESC`,
    [usuarioId, incluirInactivos],
  );
  return rows;
}

/** Vehículo del usuario (RNF-09: si no es suyo, no existe). */
async function buscarDelUsuario(db, id, usuarioId) {
  const { rows } = await db.query(`SELECT ${COLUMNAS} FROM vehiculo WHERE id = $1 AND usuario_id = $2`, [id, usuarioId]);
  return rows[0] || null;
}

async function buscarPorPlacas(db, usuarioId, placas) {
  const { rows } = await db.query(`SELECT ${COLUMNAS} FROM vehiculo WHERE usuario_id = $1 AND placas = $2`, [usuarioId, placas]);
  return rows[0] || null;
}

async function insertar(db, usuarioId, v) {
  const { rows } = await db.query(
    `INSERT INTO vehiculo (usuario_id, tipo, marca, modelo, anio, color, placas, capacidad, declaracion_licencia_seguro)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNAS}`,
    [usuarioId, v.tipo, v.marca, v.modelo, v.anio, v.color, v.placas, v.capacidad, v.declaracion_licencia_seguro],
  );
  return rows[0];
}

const EDITABLES = ['tipo', 'marca', 'modelo', 'anio', 'color', 'placas', 'capacidad', 'declaracion_licencia_seguro', 'activo'];

/** UPDATE parcial con lista blanca de columnas. Devuelve la fila o null si no es del usuario. */
async function actualizar(db, id, usuarioId, cambios) {
  const columnas = EDITABLES.filter((c) => cambios[c] !== undefined);
  if (columnas.length === 0) return buscarDelUsuario(db, id, usuarioId);
  const sets = columnas.map((c, i) => `${c} = $${i + 3}`).join(', ');
  const { rows } = await db.query(
    `UPDATE vehiculo SET ${sets} WHERE id = $1 AND usuario_id = $2 RETURNING ${COLUMNAS}`,
    [id, usuarioId, ...columnas.map((c) => cambios[c])],
  );
  return rows[0] || null;
}

/** Viajes publicados a futuro que usan el vehículo (no se puede desactivar con ellos). */
async function contarViajesPendientes(db, id) {
  const { rows } = await db.query(
    `SELECT count(*) AS n FROM viaje
      WHERE vehiculo_id = $1 AND estado IN ('publicado', 'en_curso') AND salida_en > now() - interval '2 hours'`,
    [id],
  );
  return rows[0].n;
}

/** Mayor número de asientos ofrecidos en viajes pendientes con este vehículo (0 si no hay). */
async function maxAsientosPendientes(db, id) {
  const { rows } = await db.query(
    `SELECT COALESCE(max(asientos_totales), 0) AS n FROM viaje
      WHERE vehiculo_id = $1 AND estado IN ('publicado', 'en_curso') AND salida_en > now() - interval '2 hours'`,
    [id],
  );
  return rows[0].n;
}

/**
 * Combinación del catálogo, sin distinguir mayúsculas. Devuelve la marca y el
 * modelo con la escritura del catálogo (valores normalizados) o null.
 */
async function buscarEnCatalogo(db, { tipo, marca, modelo, anio }) {
  const { rows } = await db.query(
    `SELECT marca, modelo FROM catalogo_vehiculo
      WHERE activo AND tipo = $1 AND lower(marca) = lower($2) AND lower(modelo) = lower($3) AND anio = $4
      LIMIT 1`,
    [tipo, marca, modelo, anio],
  );
  return rows[0] || null;
}

/** Catálogo activo agrupado: una fila por tipo + marca + modelo con sus años. */
async function listarCatalogo(db) {
  const { rows } = await db.query(
    `SELECT tipo, marca, modelo, array_agg(anio ORDER BY anio DESC) AS anios
       FROM catalogo_vehiculo
      WHERE activo
      GROUP BY tipo, marca, modelo
      ORDER BY marca, modelo, tipo`,
  );
  return rows;
}

module.exports = { buscarEnCatalogo, listarCatalogo, maxAsientosPendientes, listarPorUsuario, buscarDelUsuario, buscarPorPlacas, insertar, actualizar, contarViajesPendientes };
