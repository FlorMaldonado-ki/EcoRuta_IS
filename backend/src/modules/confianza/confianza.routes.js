'use strict';
/**
 * Rutas del módulo Confianza y seguridad (3.1.5).
 *
 *   GET    /api/viajes/:viajeId/participantes      a quién puedo calificar o reportar en ese viaje
 *   POST   /api/calificaciones                     { tripId, ratedUserId, score 1-5, comment? } → 201 (definitiva)
 *   PATCH  /api/calificaciones/:id/comentario      { comment } solo el autor; la puntuación no cambia
 *   DELETE /api/calificaciones/:id/comentario      solo el autor; la calificación se conserva
 *   GET    /api/calificaciones/pendientes          recordatorio único de calificar
 *   POST   /api/calificaciones/recordatorios/:viajeId   el recordatorio ya se mostró
 *   GET    /api/me/calificaciones?page=            recibidas + promedio
 *   GET    /api/me/calificaciones/dadas?page=      las que escribí
 *   POST   /api/reportes                           { reportedUserId, tripId, reason, reasonOther?, description } → 201
 *   GET    /api/me/contacto-emergencia             { contact | null }
 *   PUT    /api/me/contacto-emergencia             { name, phone, relationship, relationshipOther? }
 *   DELETE /api/me/contacto-emergencia
 *   GET    /api/me/documentos                      mis documentos y su revisión
 *   POST   /api/me/documentos                      multipart "document": reenvío tras un rechazo
 *   GET    /api/archivos/documentos/:id?exp=&sig=  archivo (URL firmada temporal, sin header de sesión)
 */
const { Router } = require('express');
const service = require('./confianza.service');
const repo = require('./confianza.repository');
const { requireAuth } = require('../../middlewares/auth');
const { documentoUsuario } = require('../../middlewares/upload');
const { esUuid } = require('../../shared/validacion');
const { firmaDocumentoValida } = require('../../shared/archivos');
const { AppError } = require('../../shared/errors');
const { pool } = require('../../config/db');
const storage = require('../../shared/storage');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const uuid = (v) => {
  if (!esUuid(v)) throw new AppError(404, 'NO_ENCONTRADO', 'No encontramos lo que buscas.');
  return v;
};

const participantesViaje = Router({ mergeParams: true });
participantesViaje.use(requireAuth);
participantesViaje.get('/', h(async (req, res) =>
  res.json(await service.participantesDeViaje(uuid(req.params.viajeId), req.user.id))));

const calificaciones = Router();
calificaciones.use(requireAuth);
calificaciones.post('/', h(async (req, res) => res.status(201).json(await service.calificar(req.user.id, req.body))));
calificaciones.get('/pendientes', h(async (req, res) => res.json(await service.pendientes(req.user.id))));
calificaciones.post('/recordatorios/:viajeId', h(async (req, res) =>
  res.json(await service.marcarRecordatorio(req.user.id, uuid(req.params.viajeId)))));
calificaciones.patch('/:id/comentario', h(async (req, res) =>
  res.json(await service.editarComentario(uuid(req.params.id), req.user.id, req.body))));
calificaciones.delete('/:id/comentario', h(async (req, res) =>
  res.json(await service.eliminarComentario(uuid(req.params.id), req.user.id))));

const misCalificaciones = Router();
misCalificaciones.use(requireAuth);
misCalificaciones.get('/', h(async (req, res) => res.json(await service.recibidas(req.user.id, req.query))));
misCalificaciones.get('/dadas', h(async (req, res) => res.json(await service.dadas(req.user.id, req.query))));

const reportes = Router();
reportes.use(requireAuth);
reportes.post('/', h(async (req, res) => res.status(201).json(await service.reportar(req.user.id, req.body))));

const contactoEmergencia = Router();
contactoEmergencia.use(requireAuth);
contactoEmergencia.get('/', h(async (req, res) => res.json(await service.obtenerContacto(req.user.id))));
contactoEmergencia.put('/', h(async (req, res) => res.json(await service.guardarContacto(req.user.id, req.body))));
contactoEmergencia.delete('/', h(async (req, res) => res.json(await service.eliminarContacto(req.user.id))));

const misDocumentos = Router();
misDocumentos.use(requireAuth);
misDocumentos.get('/', h(async (req, res) => res.json(await service.misDocumentos(req.user.id))));
misDocumentos.post('/', documentoUsuario, h(async (req, res) => res.status(201).json(await service.reenviarDocumento(req.user.id, req.file))));

// Archivo de un documento: la URL firmada la entrega la API solo al dueño o a un administrador.
const archivos = Router();
archivos.get('/documentos/:id', h(async (req, res) => {
  const noHay = new AppError(404, 'DOCUMENTO_NO_ENCONTRADO', 'El enlace del documento venció o no es válido. Vuelve a abrirlo desde la app.');
  if (!esUuid(req.params.id)) throw noHay;
  const doc = await repo.documentoPorId(pool, req.params.id);
  if (!doc || !firmaDocumentoValida(doc.id, doc.storage_key, req.query.exp, req.query.sig)) throw noHay;
  const contenido = await storage.leer(doc.storage_key);
  if (!contenido) throw noHay;
  const nombre = encodeURIComponent(doc.nombre_archivo);
  res.set({
    'Content-Type': doc.mime_type,
    'Content-Disposition': `${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${nombre}`,
    'Cache-Control': 'private, no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(contenido);
}));

module.exports = { participantesViaje, calificaciones, misCalificaciones, reportes, contactoEmergencia, misDocumentos, archivos };
