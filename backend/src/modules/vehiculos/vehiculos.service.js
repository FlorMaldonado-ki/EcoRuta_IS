'use strict';
/**
 * Lógica del módulo Vehículos (RF-06, RN-03, RN-12, RNF-09).
 * Las placas son únicas por usuario. Desactivar no borra (los viajes pasados
 * siguen apuntando al vehículo); registrar de nuevo unas placas desactivadas
 * reactiva ese vehículo con los datos nuevos.
 */
const { pool } = require('../../config/db');
const { AppError, ValidationError } = require('../../shared/errors');
const mapper = require('./vehiculo.mapper');
const repo = require('./vehiculos.repository');

const noEncontrado = () => new AppError(404, 'VEHICULO_NO_ENCONTRADO', 'No encontramos ese vehículo.');
const placasDuplicadas = () =>
  new AppError(409, 'PLACAS_REGISTRADAS', 'Ya registraste un vehículo con esas placas.', { plates: 'Ya registraste un vehículo con esas placas.' });

const fueraDeCatalogo = () => new ValidationError(
  { model: 'Esa combinación de marca, modelo y año no está en el catálogo. Revisa tu selección.' },
);

/**
 * Si los datos traen tipo/marca/modelo/año, los valida contra el catálogo y
 * reemplaza marca y modelo por su escritura oficial.
 */
async function normalizarConCatalogo(datos) {
  if (datos.tipo === undefined) return datos;
  const fila = await repo.buscarEnCatalogo(pool, datos);
  if (!fila) throw fueraDeCatalogo();
  return { ...datos, marca: fila.marca, modelo: fila.modelo };
}

const CACHE_CATALOGO_MS = 10 * 60_000;
let catalogo = null;
let catalogoEn = 0;

/** GET /api/catalogos/vehiculos. Se cachea en memoria: cambia solo con migraciones. */
async function catalogoDTO() {
  if (!catalogo || Date.now() - catalogoEn > CACHE_CATALOGO_MS) {
    const filas = await repo.listarCatalogo(pool);
    catalogo = {
      types: Object.entries(mapper.TIPOS_VEHICULO).map(([key, label]) => ({ key, label })),
      models: filas.map((f) => ({ type: f.tipo, brand: f.marca, model: f.modelo, years: f.anios })),
    };
    catalogoEn = Date.now();
  }
  return catalogo;
}

async function listar(usuarioId, { incluirInactivos = false } = {}) {
  const filas = await repo.listarPorUsuario(pool, usuarioId, { incluirInactivos });
  return filas.map(mapper.toVehiculoDTO);
}

async function obtener(usuarioId, id) {
  const fila = await repo.buscarDelUsuario(pool, id, usuarioId);
  if (!fila) throw noEncontrado();
  return mapper.toVehiculoDTO(fila);
}

/** @returns {{ vehiculo: object, reactivado: boolean }} */
async function registrar(usuarioId, body) {
  const datos = await normalizarConCatalogo(mapper.parseVehiculo(body));
  const existente = await repo.buscarPorPlacas(pool, usuarioId, datos.placas);
  if (existente?.activo) throw placasDuplicadas();
  if (existente) {
    const fila = await repo.actualizar(pool, existente.id, usuarioId, { ...datos, activo: true });
    return { vehiculo: mapper.toVehiculoDTO(fila), reactivado: true };
  }
  const fila = await repo.insertar(pool, usuarioId, datos);
  return { vehiculo: mapper.toVehiculoDTO(fila), reactivado: false };
}

async function actualizar(usuarioId, id, body) {
  const cambios = await normalizarConCatalogo(mapper.parseVehiculo(body, { parcial: true }));
  const actual = await repo.buscarDelUsuario(pool, id, usuarioId);
  if (!actual) throw noEncontrado();
  if (!actual.activo) throw new AppError(409, 'VEHICULO_INACTIVO', 'Ese vehículo está desactivado. Regístralo de nuevo para reactivarlo.');
  if (cambios.placas && cambios.placas !== actual.placas) {
    const otro = await repo.buscarPorPlacas(pool, usuarioId, cambios.placas);
    if (otro) throw placasDuplicadas();
  }
  if (cambios.capacidad !== undefined && cambios.capacidad < actual.capacidad) {
    const ofrecidos = await repo.maxAsientosPendientes(pool, id);
    if (ofrecidos > cambios.capacidad - 1) {
      const msg = `Tienes un viaje publicado con ${ofrecidos} asiento(s); la capacidad mínima es ${ofrecidos + 1}.`;
      throw new AppError(409, 'VEHICULO_CON_VIAJES', msg, { capacity: msg });
    }
  }
  const fila = await repo.actualizar(pool, id, usuarioId, cambios);
  if (!fila) throw noEncontrado();
  return mapper.toVehiculoDTO(fila);
}

async function desactivar(usuarioId, id) {
  const actual = await repo.buscarDelUsuario(pool, id, usuarioId);
  if (!actual) throw noEncontrado();
  if (!actual.activo) return mapper.toVehiculoDTO(actual); // idempotente
  if ((await repo.contarViajesPendientes(pool, id)) > 0) {
    throw new AppError(409, 'VEHICULO_CON_VIAJES', 'Tienes viajes publicados con este vehículo. Cancélalos antes de desactivarlo.');
  }
  const fila = await repo.actualizar(pool, id, usuarioId, { activo: false });
  return mapper.toVehiculoDTO(fila);
}

/**
 * Para el módulo Viajes: vehículo del conductor listo para publicar.
 * Lanza 422 con `fields.vehicleId` si no es suyo o está desactivado.
 * @returns {Promise<{ id: string, capacidad: number }>}
 */
async function paraPublicar(usuarioId, id) {
  const fila = await repo.buscarDelUsuario(pool, id, usuarioId);
  if (!fila) throw new AppError(422, 'VEHICULO_NO_ENCONTRADO', 'Selecciona uno de tus vehículos.', { vehicleId: 'Selecciona uno de tus vehículos.' });
  if (!fila.activo) throw new AppError(422, 'VEHICULO_INACTIVO', 'Ese vehículo está desactivado.', { vehicleId: 'Ese vehículo está desactivado.' });
  return { id: fila.id, capacidad: fila.capacidad };
}

module.exports = { catalogoDTO, listar, obtener, registrar, actualizar, desactivar, paraPublicar };
