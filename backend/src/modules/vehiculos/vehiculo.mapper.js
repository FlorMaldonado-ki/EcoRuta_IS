'use strict';
/**
 * Mapper del módulo Vehículos (RF-06, RN-03, RN-12).
 *   Cliente (VehicleDTO / VehicleRequest)  ⇄  BD (tabla vehiculo)
 * Los errores usan las claves del formulario del frontend.
 */
const { ValidationError } = require('../../shared/errors');
const { str, entero } = require('../../shared/validacion');

/** Mayúsculas, sin espacios, guiones ni puntos ("ptx-12 34" → "PTX1234"). */
const normalizarPlacas = (v) => str(v).toUpperCase().replace(/[\s.\-]/g, '');

const TEXTOS = [
  ['brand', 'marca', 50, 'Escribe la marca del vehículo.'],
  ['model', 'modelo', 50, 'Escribe el modelo del vehículo.'],
  ['color', 'color', 30, 'Escribe el color del vehículo.'],
];

/**
 * Valida el cuerpo de POST (parcial = false) o PATCH (parcial = true).
 * @returns {Record<string, unknown>} columnas de vehiculo a escribir
 */
function parseVehiculo(body, { parcial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError({}, 'Envía los datos del vehículo.');
  const errors = {};
  const cols = {};
  const presente = (k) => !parcial || body[k] !== undefined;

  for (const [campo, columna, max, msg] of TEXTOS) {
    if (!presente(campo)) continue;
    const v = str(body[campo]).replace(/\s+/g, ' ');
    if (!v) errors[campo] = msg;
    else if (v.length > max) errors[campo] = `Máximo ${max} caracteres.`;
    else cols[columna] = v;
  }

  if (presente('plates')) {
    const placas = normalizarPlacas(body.plates);
    if (!/^[A-Z0-9]{5,10}$/.test(placas)) errors.plates = 'Las placas deben tener de 5 a 10 letras o números.';
    else cols.placas = placas;
  }

  if (presente('capacity')) {
    const cap = entero(body.capacity);
    if (cap === null || cap < 2 || cap > 9) errors.capacity = 'La capacidad debe ser de 2 a 9 personas, contando al conductor.';
    else cols.capacidad = cap;
  }

  // RN-12 / RF-06: la declaración es obligatoria al registrar; en una edición, si viene, debe ser true.
  if (presente('licenseAndInsuranceDeclared')) {
    if (body.licenseAndInsuranceDeclared !== true) {
      errors.licenseAndInsuranceDeclared = 'Debes declarar que cuentas con licencia vigente y seguro del vehículo.';
    } else cols.declaracion_licencia_seguro = true;
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
  if (parcial && Object.keys(cols).length === 0) throw new ValidationError({}, 'No enviaste ningún cambio.');
  return cols;
}

/** VehicleDTO. `plates` solo se manda al dueño o a un pasajero con reserva aceptada (RNF-12). */
function toVehiculoDTO(row) {
  return {
    id: row.id,
    brand: row.marca,
    model: row.modelo,
    color: row.color,
    plates: row.placas,
    capacity: row.capacidad,
    maxSeats: row.capacidad - 1, // asientos que puede ofrecer (RN-03)
    licenseAndInsuranceDeclared: row.declaracion_licencia_seguro,
    active: row.activo,
    createdAt: row.creado_en,
  };
}

module.exports = { parseVehiculo, toVehiculoDTO, normalizarPlacas };
