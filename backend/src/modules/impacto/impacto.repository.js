'use strict';
/** SQL del Eco-Calculator (solo lectura de las vistas de la migración 006). */

const HOY_LOCAL = `(now() AT TIME ZONE 'America/Mexico_City')::date`;

async function comunidad(db) {
  const { rows } = await db.query('SELECT co2_total_kg, viajes_compartidos, km_evitados FROM v_co2_comunidad');
  return rows[0];
}

/** RF-23 · totales del usuario, con desglose como conductor y como pasajero. */
async function resumenUsuario(db, usuarioId) {
  const { rows } = await db.query(
    `SELECT COALESCE(sum(co2_kg), 0)                                                     AS total,
            COALESCE(sum(co2_kg) FILTER (WHERE fecha_local = ${HOY_LOCAL}), 0)           AS hoy,
            count(*)                                                                    AS viajes,
            COALESCE(sum(km_evitados), 0)                                                AS km_evitados,
            COALESCE(sum(co2_kg) FILTER (WHERE participacion = 'conductor'), 0)          AS conductor_co2,
            count(*)             FILTER (WHERE participacion = 'conductor')              AS conductor_viajes,
            COALESCE(sum(co2_kg) FILTER (WHERE participacion = 'conductor' AND fecha_local = ${HOY_LOCAL}), 0) AS conductor_hoy,
            COALESCE(sum(co2_kg) FILTER (WHERE participacion = 'pasajero'), 0)           AS pasajero_co2,
            count(*)             FILTER (WHERE participacion = 'pasajero')               AS pasajero_viajes,
            COALESCE(sum(co2_kg) FILTER (WHERE participacion = 'pasajero' AND fecha_local = ${HOY_LOCAL}), 0)  AS pasajero_hoy
       FROM v_co2_usuario WHERE usuario_id = $1`,
    [usuarioId],
  );
  return rows[0];
}

/** RF-23 · historial: un renglón por viaje con el CO₂ atribuido (limite + 1 filas). */
async function viajesUsuario(db, usuarioId, { limite, pagina }) {
  const { rows } = await db.query(
    `SELECT cu.viaje_id, cu.participacion, cu.co2_kg, cu.km_evitados,
            i.calculado_en, i.pasajeros, i.distancia_km, i.factor_emision,
            v.sentido, v.origen_texto, v.destino_texto, v.salida_en, v.finalizado_en,
            v.conductor_id, c.nombre_completo AS conductor_nombre, c.foto_storage_key AS conductor_foto
       FROM v_co2_usuario cu
       JOIN impacto_viaje i ON i.viaje_id = cu.viaje_id
       JOIN viaje v         ON v.id = cu.viaje_id
       JOIN usuario c       ON c.id = v.conductor_id
      WHERE cu.usuario_id = $1
      ORDER BY i.calculado_en DESC, cu.viaje_id
      LIMIT $2 OFFSET $3`,
    [usuarioId, limite + 1, (pagina - 1) * limite],
  );
  return rows;
}

module.exports = { comunidad, resumenUsuario, viajesUsuario };
