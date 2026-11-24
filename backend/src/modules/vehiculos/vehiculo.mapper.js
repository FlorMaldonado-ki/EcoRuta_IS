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
  ['brand', 'marca', 50, 'Selecciona la marca del vehículo.'],
  ['model', 'modelo', 50, 'Selecciona el modelo del vehículo.'],
  ['color', 'color', 30, 'Selecciona el color del vehículo.'],
];

/** Tipos del catálogo (clave en BD → etiqueta para el cliente). */
const TIPOS_VEHICULO = { automovil: 'Automóvil', suv: 'SUV / Minivan', pickup: 'Pickup' };

/** Campos que identifican el vehículo en el catálogo: se envían y validan juntos. */
const CAMPOS_CATALOGO = ['type', 'brand', 'model', 'year'];

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

  if (presente('type')) {
    if (!Object.hasOwn(TIPOS_VEHICULO, body.type)) errors.type = 'Selecciona el tipo de vehículo.';
    else cols.tipo = body.type;
  }

  if (presente('year')) {
    const anio = entero(body.year);
    if (anio === null || anio < 1980 || anio > new Date().getFullYear() + 1) errors.year = 'Selecciona el año del vehículo.';
    else cols.anio = anio;
  }

  // En una edición, cambiar cualquiera de estos obliga a mandar los cuatro para validar la combinación.
  if (parcial && CAMPOS_CATALOGO.some((k) => body[k] !== undefined)) {
    for (const k of CAMPOS_CATALOGO) {
      if (body[k] === undefined && !errors[k]) errors[k] = 'Envía tipo, marca, modelo y año juntos.';
    }
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
    type: row.tipo ?? null,
    brand: row.marca,
    model: row.modelo,
    year: row.anio ?? null,
    color: row.color,
    plates: row.placas,
    capacity: row.capacidad,
    maxSeats: row.capacidad - 1, // asientos que puede ofrecer (RN-03)
    licenseAndInsuranceDeclared: row.declaracion_licencia_seguro,
    active: row.activo,
    createdAt: row.creado_en,
  };
}

module.exports = { parseVehiculo, toVehiculoDTO, normalizarPlacas, TIPOS_VEHICULO };
