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

module.exports = {
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
};
