'use strict';
/** Plantillas de correo (RF-02, RF-04, RNF-22: guinda y dorado). */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(titulo, cuerpoHtml) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f3ef;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#6B1736;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:bold">EcoRuta Escolar <span style="color:#C59B27">·</span> TecNM Morelia</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:18px;margin:0 0 12px">${esc(titulo)}</h1>${cuerpoHtml}</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#777;border-top:1px solid #eee">Si no solicitaste este correo, ignóralo. Nadie de EcoRuta te pedirá tu contraseña.</td></tr>
</table></td></tr></table></body></html>`;
}

const boton = (enlace, texto) =>
  `<p style="margin:24px 0"><a href="${esc(enlace)}" style="background:#6B1736;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(texto)}</a></p>
<p style="font-size:12px;color:#777;word-break:break-all">Si el botón no funciona, copia este enlace en tu navegador:<br>${esc(enlace)}</p>`;

const FORMATO_FECHA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
});
/** Fecha y hora de salida en hora de Morelia: "lunes, 24 de noviembre, 7:30 a.m." */
const fechaSalida = (d) => FORMATO_FECHA.format(new Date(d));

/** Bloque con los datos del viaje (origen → destino y salida). */
function resumenViaje(v) {
  const ruta = `${v.origen_texto} → ${v.destino_texto}`;
  return {
    texto: `Viaje: ${ruta}\nSalida: ${fechaSalida(v.salida_en)}`,
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f3ef;border-radius:8px;margin:16px 0">
<tr><td style="padding:12px 16px;font-size:14px"><b>Viaje:</b> ${esc(ruta)}<br><b>Salida:</b> ${esc(fechaSalida(v.salida_en))}</td></tr></table>`,
  };
}

/** Enlace a OpenStreetMap del punto de encuentro (sin depender de Google). */
const mapa = (p) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`;

const PIE_APP = 'Abre la app de EcoRuta Escolar para ver el detalle.';

module.exports = {
  fechaSalida,
  verificacion(nombre, enlace) {
    return {
      subject: 'Verifica tu correo · EcoRuta Escolar',
      text: `Hola ${nombre}:\n\nConfirma tu correo institucional para activar tu cuenta de EcoRuta Escolar:\n${enlace}\n\nEl enlace vence en 24 horas.`,
      html: layout('Confirma tu correo institucional', `<p>Hola ${esc(nombre)}:</p>
<p>Gracias por registrarte. Confirma tu correo para activar tu cuenta y empezar a compartir viajes.</p>
${boton(enlace, 'Verificar mi correo')}<p style="font-size:13px">El enlace vence en <b>24 horas</b>. Puedes pedir uno nuevo desde la app.</p>`),
    };
  },
  recuperacion(nombre, enlace) {
    return {
      subject: 'Restablece tu contraseña · EcoRuta Escolar',
      text: `Hola ${nombre}:\n\nPara crear una contraseña nueva abre este enlace:\n${enlace}\n\nEl enlace vence en 1 hora y solo funciona una vez.`,
      html: layout('Restablece tu contraseña', `<p>Hola ${esc(nombre)}:</p>
<p>Recibimos una solicitud para restablecer tu contraseña.</p>
${boton(enlace, 'Crear contraseña nueva')}<p style="font-size:13px">El enlace vence en <b>1 hora</b> y solo funciona una vez.</p>`),
    };
  },

  // ── RF-20 · Avisos de reservas y cancelaciones ────────────────────────────
  // ctx: { origen_texto, destino_texto, salida_en, conductor_nombre, pasajero_nombre, ... }

  /** Pasajero solicitó lugar → conductor (RF-15). */
  solicitudRecibida(ctx) {
    const v = resumenViaje(ctx);
    return {
      subject: `Nueva solicitud de ${ctx.pasajero_nombre} · EcoRuta Escolar`,
      text: `Hola ${ctx.conductor_nombre}:\n\n${ctx.pasajero_nombre} quiere un lugar en tu viaje.\n${v.texto}\n\nAcepta o rechaza la solicitud desde Mis viajes. ${PIE_APP}`,
      html: layout('Tienes una nueva solicitud', `<p>Hola ${esc(ctx.conductor_nombre)}:</p>
<p><b>${esc(ctx.pasajero_nombre)}</b> quiere un lugar en tu viaje.</p>${v.html}
<p>Acepta o rechaza la solicitud desde <b>Mis viajes</b>. ${esc(PIE_APP)}</p>`),
    };
  },

  /** Conductor aceptó o rechazó → pasajero (RF-16). Si fue aceptada, con el punto de encuentro. */
  solicitudRespondida(ctx) {
    const v = resumenViaje(ctx);
    if (ctx.estado !== 'aceptada') {
      return {
        subject: 'Tu solicitud no fue aceptada · EcoRuta Escolar',
        text: `Hola ${ctx.pasajero_nombre}:\n\n${ctx.conductor_nombre} no pudo aceptar tu solicitud.\n${v.texto}\n\nBusca otro viaje en la app; hay más conductores de la comunidad.`,
        html: layout('Tu solicitud no fue aceptada', `<p>Hola ${esc(ctx.pasajero_nombre)}:</p>
<p><b>${esc(ctx.conductor_nombre)}</b> no pudo aceptar tu solicitud.</p>${v.html}
<p>Busca otro viaje en la app; hay más conductores de la comunidad.</p>`),
      };
    }
    const p = ctx.punto_union;
    const puntoTxt = p ? `\nPunto de encuentro: ${p.nombre} (${mapa(p)})${p.nota ? `\nNota: ${p.nota}` : ''}` : '';
    const puntoHtml = p
      ? `<p><b>Punto de encuentro:</b> ${esc(p.nombre)} · <a href="${esc(mapa(p))}" style="color:#6B1736">ver en el mapa</a>${p.nota ? `<br><b>Nota:</b> ${esc(p.nota)}` : ''}</p>`
      : '';
    const telTxt = ctx.conductor_telefono ? `\nTeléfono del conductor: ${ctx.conductor_telefono}` : '';
    const telHtml = ctx.conductor_telefono ? `<p><b>Teléfono del conductor:</b> ${esc(ctx.conductor_telefono)}</p>` : '';
    return {
      subject: '¡Tu lugar está confirmado! · EcoRuta Escolar',
      text: `Hola ${ctx.pasajero_nombre}:\n\n${ctx.conductor_nombre} aceptó tu solicitud.\n${v.texto}${puntoTxt}${telTxt}\n\nLlega unos minutos antes. Si ya no puedes ir, cancela tu lugar desde la app.`,
      html: layout('¡Tu lugar está confirmado!', `<p>Hola ${esc(ctx.pasajero_nombre)}:</p>
<p><b>${esc(ctx.conductor_nombre)}</b> aceptó tu solicitud.</p>${v.html}${puntoHtml}${telHtml}
<p>Llega unos minutos antes. Si ya no puedes ir, cancela tu lugar desde la app.</p>`),
    };
  },

  /** Conductor canceló el viaje → cada pasajero con reserva vigente (RF-13). */
  viajeCancelado(ctx) {
    const v = resumenViaje(ctx);
    return {
      subject: 'Se canceló un viaje que tenías · EcoRuta Escolar',
      text: `Hola ${ctx.pasajero_nombre}:\n\n${ctx.conductor_nombre} canceló el viaje.\n${v.texto}\n\nTu lugar quedó liberado. Busca otro viaje en la app.`,
      html: layout('Se canceló tu viaje', `<p>Hola ${esc(ctx.pasajero_nombre)}:</p>
<p><b>${esc(ctx.conductor_nombre)}</b> canceló el viaje.</p>${v.html}
<p>Tu lugar quedó liberado. Busca otro viaje en la app.</p>`),
    };
  },

  /** Pasajero canceló su lugar o retiró su solicitud → conductor (RF-17). Indica si fue tardía (RN-06). */
  reservaCancelada(ctx, { eraAceptada }) {
    const v = resumenViaje(ctx);
    const accion = eraAceptada ? 'canceló su lugar en tu viaje' : 'retiró su solicitud para tu viaje';
    const tardiaTxt = ctx.cancelacion_tardia ? '\nFue una cancelación tardía (menos de 20 minutos antes de la salida).' : '';
    const tardiaHtml = ctx.cancelacion_tardia
      ? '<p style="color:#6B1736"><b>Fue una cancelación tardía</b> (menos de 20 minutos antes de la salida).</p>' : '';
    const lugarTxt = eraAceptada ? '\n\nSe liberó un asiento en tu viaje.' : '';
    return {
      subject: `${ctx.pasajero_nombre} ${eraAceptada ? 'canceló su lugar' : 'retiró su solicitud'} · EcoRuta Escolar`,
      text: `Hola ${ctx.conductor_nombre}:\n\n${ctx.pasajero_nombre} ${accion}.\n${v.texto}${tardiaTxt}${lugarTxt}`,
      html: layout(eraAceptada ? 'Un pasajero canceló su lugar' : 'Un pasajero retiró su solicitud', `<p>Hola ${esc(ctx.conductor_nombre)}:</p>
<p><b>${esc(ctx.pasajero_nombre)}</b> ${esc(accion)}.</p>${v.html}${tardiaHtml}${eraAceptada ? '<p>Se liberó un asiento en tu viaje.</p>' : ''}`),
    };
  },
};
