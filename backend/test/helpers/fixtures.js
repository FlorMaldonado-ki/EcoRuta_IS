'use strict';
/**
 * Datos de prueba aislados: cada archivo crea sus propios usuarios (correo
 * único), vehículos y viajes, y los borra al terminar. Requiere entorno.js antes.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../../src/config/db');
const { firmarToken } = require('../../src/middlewares/auth');

const HASH = bcrypt.hashSync('Prueba1234', 4);
const sufijo = () => crypto.randomBytes(4).toString('hex');

function crearContexto() {
  const usuarios = [];

  async function usuario({ nombre = 'Usuario Prueba', tipo = 'estudiante', telefono = '4430000000', estado = 'activo', rol = 'usuario' } = {}) {
    const correo = `prueba.${sufijo()}@morelia.tecnm.mx`;
    const { rows } = await pool.query(
      `INSERT INTO usuario (institucion_id, nombre_completo, correo, hash_contrasena, tipo, carrera, departamento,
                            telefono, rol, estado, acepto_terminos_en, verificado_en)
       SELECT id, $1, $2, $3, $4, $5, $6, $7, $8, $9::varchar, now(), CASE WHEN $9::varchar = 'pendiente' THEN NULL ELSE now() END
         FROM institucion ORDER BY creado_en LIMIT 1
       RETURNING id, correo, rol`,
      [nombre, correo, HASH, tipo,
        tipo === 'estudiante' ? 'Ingeniería Industrial' : null,
        tipo === 'docente' ? 'Departamento de Ciencias Básicas' : null,
        telefono, rol, estado],
    );
    const u = rows[0];
    usuarios.push(u.id);
    return { ...u, token: firmarToken(u) };
  }

  async function vehiculo(usuarioId, { capacidad = 5, placas = `T${sufijo().toUpperCase()}` } = {}) {
    const { rows } = await pool.query(
      `INSERT INTO vehiculo (usuario_id, marca, modelo, color, placas, capacidad, declaracion_licencia_seguro)
       VALUES ($1, 'Marca', 'Modelo', 'Gris', $2, $3, true) RETURNING *`,
      [usuarioId, placas, capacidad],
    );
    return rows[0];
  }

  /** Viaje insertado directo en BD (permite salidas a menos de 30 min para probar RN-06). */
  async function viaje(conductorId, vehiculoId, { minutos = 180, asientos = 3, sentido = 'hacia_campus', lat = 19.7039, lng = -101.1924 } = {}) {
    const campus = [19.7217, -101.1858];
    const [o, d] = sentido === 'hacia_campus' ? [[lat, lng], campus] : [campus, [lat, lng]];
    const { rows } = await pool.query(
      `INSERT INTO viaje (conductor_id, vehiculo_id, sentido, punto_campus,
                          origen_texto, origen_lat, origen_lng, destino_texto, destino_lat, destino_lng,
                          salida_en, asientos_totales, distancia_km, duracion_min, distancia_fuente)
       VALUES ($1, $2, $3, 'campus_1', 'Origen prueba', $4, $5, 'Destino prueba', $6, $7,
               now() + make_interval(mins => $8), $9, 4.5, 15, 'haversine')
       RETURNING *`,
      [conductorId, vehiculoId, sentido, o[0], o[1], d[0], d[1], minutos, asientos],
    );
    return rows[0];
  }

  /** Borra todo lo creado (orden inverso a las llaves foráneas). */
  async function limpiar() {
    if (!usuarios.length) return;
    const ids = usuarios;
    await pool.query(`DELETE FROM notificacion WHERE usuario_id = ANY($1)`, [ids]);
    // Calificaciones: el trigger solo permite borrarlas con la marca de limpieza de pruebas.
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL ecoruta.limpieza_pruebas = 'on'`);
      await c.query('DELETE FROM calificacion WHERE evaluador_id = ANY($1) OR evaluado_id = ANY($1)', [ids]);
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
    await pool.query('DELETE FROM reporte WHERE reportante_id = ANY($1) OR usuario_reportado_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM recordatorio_calificacion WHERE usuario_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM documento_usuario WHERE usuario_id = ANY($1)', [ids]);
    await pool.query(`DELETE FROM reserva WHERE pasajero_id = ANY($1) OR viaje_id IN (SELECT id FROM viaje WHERE conductor_id = ANY($1))`, [ids]);
    await pool.query(`DELETE FROM impacto_viaje WHERE viaje_id IN (SELECT id FROM viaje WHERE conductor_id = ANY($1))`, [ids]);
    await pool.query('DELETE FROM viaje WHERE conductor_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM vehiculo WHERE usuario_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM token_verificacion WHERE usuario_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM usuario WHERE id = ANY($1)', [ids]);
  }

  return { usuario, vehiculo, viaje, limpiar };
}

module.exports = { crearContexto, pool };
