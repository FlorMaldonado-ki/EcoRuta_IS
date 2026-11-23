'use strict';
/** RF-22 · Factor de emisión (kg de CO₂ por km) guardado en parametro.factor_emision_kg_km. */
const { pool } = require('../../config/db');
const { AppError, ValidationError } = require('../../shared/errors');
const { numero } = require('../../shared/validacion');
const catalogos = require('../catalogos/catalogos.service');

const CLAVE = 'factor_emision_kg_km';

const toDTO = (fila) => ({
  value: Number(fila.valor),
  unit: 'kg_co2_per_km',
  updatedAt: fila.actualizado_en,
  updatedBy: fila.actualizado_por ?? null,
});

/** Valida el cuerpo del PATCH: { value } con 0 < value < 1 y hasta 4 decimales (NUMERIC(6,4)). */
function parseFactor(body) {
  const v = numero(body?.value);
  if (v === null) throw new ValidationError({ value: 'Escribe el factor de emisión en kg de CO₂ por km (p. ej. 0.192).' });
  if (!(v > 0 && v < 1)) throw new ValidationError({ value: 'El factor debe ser mayor que 0 y menor que 1.' });
  if (Math.round(v * 10000) / 10000 !== v) throw new ValidationError({ value: 'Usa máximo 4 decimales.' });
  return v;
}

async function obtenerFactorEmision() {
  const { rows } = await pool.query(
    `SELECT (valor #>> '{}')::numeric AS valor, actualizado_en, actualizado_por FROM parametro WHERE clave = $1`, [CLAVE]);
  if (!rows[0]) throw new AppError(404, 'PARAMETRO_NO_ENCONTRADO', 'El factor de emisión no está configurado.');
  return toDTO(rows[0]);
}

async function actualizarFactorEmision(adminId, body) {
  const valor = parseFactor(body);
  const { rows } = await pool.query(
    `UPDATE parametro SET valor = to_jsonb($2::numeric), actualizado_por = $3
      WHERE clave = $1
      RETURNING (valor #>> '{}')::numeric AS valor, actualizado_en, actualizado_por`,
    [CLAVE, valor, adminId],
  );
  if (!rows[0]) throw new AppError(404, 'PARAMETRO_NO_ENCONTRADO', 'El factor de emisión no está configurado.');
  catalogos.invalidar(); // la caché de catálogos también guarda el FE
  return toDTO(rows[0]);
}

module.exports = { obtenerFactorEmision, actualizarFactorEmision, parseFactor };
