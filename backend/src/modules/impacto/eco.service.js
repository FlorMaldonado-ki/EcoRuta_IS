'use strict';
/**
 * Eco-Calculator · cálculo del CO₂ ahorrado por viaje (RF-21, RF-22, RN-07).
 *
 *   CO₂ (kg) = distancia (km) × factor de emisión (kg/km) × pasajeros aceptados
 *
 * La fórmula vive también en la columna generada impacto_viaje.co2_kg; aquí
 * se replica en JS (calcularCo2) solo para las pruebas unitarias y para que la
 * app pueda mostrar el resumen sin otra consulta. El valor que manda es el de BD.
 */

/** Factor de emisión inicial del ERS (RF-22) por si el parámetro faltara. */
const FACTOR_EMISION_INICIAL = 0.192;

/** Redondeo a 3 decimales igual que round(x, 3) de PostgreSQL (mitad hacia arriba). */
function redondear3(x) {
  return Math.round((x + Number.EPSILON) * 1000) / 1000;
}

/**
 * RF-21 · CO₂ ahorrado por un viaje compartido.
 * @param {number} distanciaKm  distancia del viaje (2 decimales, como viaje.distancia_km)
 * @param {number} factor       kg de CO₂ por km (0 < factor < 1)
 * @param {number} pasajeros    pasajeros con reserva aceptada (RN-07: 0 → no hay ahorro)
 * @returns {number} kg con 3 decimales
 */
function calcularCo2(distanciaKm, factor, pasajeros) {
  if (!(distanciaKm > 0) || !(factor > 0) || !(pasajeros > 0)) return 0;
  return redondear3(distanciaKm * factor * pasajeros);
}

/** RF-23 · CO₂ que se atribuye a un pasajero: su asiento (distancia × FE). */
const co2Pasajero = (distanciaKm, factor) => calcularCo2(distanciaKm, factor, 1);

/** Factor vigente leído directo de la BD (no de la caché: RF-22 aplica al siguiente viaje). */
async function factorVigente(db) {
  const { rows } = await db.query(
    `SELECT (valor #>> '{}')::numeric AS factor FROM parametro WHERE clave = 'factor_emision_kg_km'`,
  );
  const f = rows[0] ? Number(rows[0].factor) : NaN;
  return f > 0 && f < 1 ? f : FACTOR_EMISION_INICIAL;
}

/**
 * RF-21 · Registra el impacto de un viaje recién finalizado DENTRO de la
 * transacción de finalizar (el trigger trg_impacto_validar exige estado
 * 'finalizado'). Guarda una "fotografía" de la distancia y del FE, para que un
 * cambio posterior del FE no altere viajes anteriores.
 *
 * @param {string} viajeId
 * @param {import('pg').PoolClient} db  cliente de la transacción
 * @returns {Promise<null | { co2Kg: number, passengers: number, distanceKm: number, emissionFactor: number }>}
 *   null si el viaje no tuvo pasajeros aceptados (RN-07)
 */
async function calcularImpacto(viajeId, db) {
  const { rows: [v] } = await db.query(
    `SELECT v.distancia_km,
            (SELECT count(*) FROM reserva r WHERE r.viaje_id = v.id AND r.estado = 'aceptada') AS pasajeros
       FROM viaje v WHERE v.id = $1`,
    [viajeId],
  );
  if (!v || v.pasajeros < 1) return null; // RN-07: sin pasajeros no hay ahorro que registrar

  const factor = await factorVigente(db);
  const { rows: [i] } = await db.query(
    `INSERT INTO impacto_viaje (viaje_id, pasajeros, distancia_km, factor_emision)
     VALUES ($1, $2, $3, $4)
     RETURNING co2_kg, pasajeros, distancia_km, factor_emision`,
    [viajeId, v.pasajeros, v.distancia_km, factor],
  );
  return toImpactoDTO(i);
}

/** Fila de impacto_viaje → DTO del cliente. */
function toImpactoDTO(i) {
  return {
    co2Kg: Number(i.co2_kg),
    passengers: Number(i.pasajeros),
    distanceKm: Number(i.distancia_km),
    emissionFactor: Number(i.factor_emision),
  };
}

module.exports = { calcularCo2, co2Pasajero, calcularImpacto, factorVigente, toImpactoDTO, redondear3, FACTOR_EMISION_INICIAL };
