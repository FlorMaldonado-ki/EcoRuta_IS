'use strict';
/**
 * Catálogos (tabla parametro) e institución. Se cachean 60 s en memoria: cambian
 * muy poco y se consultan en cada registro. Con varias instancias de la API la
 * caché es por instancia, lo cual es aceptable para datos casi estáticos.
 */
const { pool } = require('../../config/db');

const TTL_MS = 60_000;
let cache = null;
let cacheEn = 0;

async function cargar() {
  const [{ rows: params }, { rows: insts }] = await Promise.all([
    pool.query(`SELECT clave, valor FROM parametro
                 WHERE clave IN ('carreras', 'departamentos', 'puntos_campus', 'factor_emision_kg_km')`),
    pool.query('SELECT id, nombre, dominios_correo FROM institucion ORDER BY creado_en'),
  ]);
  const p = Object.fromEntries(params.map((r) => [r.clave, r.valor]));
  if (!insts[0]) throw new Error('No hay institución registrada: ¿corriste las migraciones (008)?');
  return {
    institucion: insts[0], // F1: una sola (RNF-18)
    carreras: p.carreras || [],
    departamentos: p.departamentos || [],
    puntosCampus: p.puntos_campus || [],
    factorEmision: Number(p.factor_emision_kg_km),
  };
}

async function obtener() {
  if (!cache || Date.now() - cacheEn > TTL_MS) {
    cache = await cargar();
    cacheEn = Date.now();
  }
  return cache;
}

/** Contexto que necesita el mapper de registro. */
async function contextoRegistro() {
  const c = await obtener();
  return {
    institucionId: c.institucion.id,
    dominios: c.institucion.dominios_correo,
    carreras: c.carreras,
    departamentos: c.departamentos,
  };
}

/** DTO público para GET /api/catalogos (CatalogsDTO del contrato). */
async function catalogosDTO() {
  const c = await obtener();
  return {
    institution: { name: c.institucion.nombre, emailDomains: c.institucion.dominios_correo },
    careers: c.carreras,
    departments: c.departamentos,
    campusPoints: c.puntosCampus.map((x) => ({ key: x.clave, name: x.nombre, lat: x.lat, lng: x.lng })),
  };
}

module.exports = { obtener, contextoRegistro, catalogosDTO, invalidar: () => { cache = null; } };
