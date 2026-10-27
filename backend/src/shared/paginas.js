'use strict';
/**
 * Páginas HTML mínimas que se abren desde los enlaces del correo (en el
 * navegador del celular, fuera de la app): verificación y nueva contraseña.
 * Sin JavaScript: compatibles con la CSP por defecto de helmet.
 */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina(titulo, cuerpo, tono = 'ok') {
  const color = { ok: '#1B7F4B', error: '#B42318', info: '#6B1736' }[tono];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · EcoRuta Escolar</title>
<style>
  body{margin:0;background:#f6f3ef;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f1f1f}
  header{background:#6B1736;color:#fff;padding:18px 20px;font-weight:700;font-size:18px}
  header span{color:#C59B27}
  main{max-width:440px;margin:24px auto;padding:0 16px}
  .card{background:#fff;border-radius:14px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
  h1{font-size:20px;margin:0 0 10px;color:${color}}
  p{line-height:1.5}
  label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
  input{width:100%;box-sizing:border-box;padding:12px;border:1.5px solid #d9d2c8;border-radius:10px;font-size:16px}
  button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:10px;background:#6B1736;color:#fff;font-size:16px;font-weight:700}
  small{color:#666}
  .err{background:#FEF3F2;color:#B42318;border-radius:10px;padding:10px 12px;font-size:14px}
</style></head>
<body><header>EcoRuta Escolar <span>·</span> TecNM Morelia</header><main><div class="card">${cuerpo}</div></main></body></html>`;
}

module.exports = {
  mensaje: (titulo, texto, tono) => pagina(titulo, `<h1>${esc(titulo)}</h1><p>${esc(texto)}</p>`, tono),

  formularioContrasena: (token, error) =>
    pagina('Nueva contraseña', `<h1>Crea tu contraseña nueva</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/api/auth/reset-password">
  <input type="hidden" name="token" value="${esc(token)}">
  <label for="p1">Contraseña nueva</label>
  <input id="p1" name="password" type="password" minlength="8" maxlength="72" required autocomplete="new-password">
  <small>Mínimo 8 caracteres, con letras y números.</small>
  <label for="p2">Confirmar contraseña</label>
  <input id="p2" name="confirmPassword" type="password" minlength="8" maxlength="72" required autocomplete="new-password">
  <button type="submit">Guardar contraseña</button>
</form>`, 'info'),
};
