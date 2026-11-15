'use strict';
/** Levanta la app en un puerto libre y ofrece `pedir(metodo, ruta, { token, body })`. */
const app = require('../../src/app');

async function iniciarServidor() {
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function pedir(metodo, ruta, { token, body, headers = {} } = {}) {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* no es JSON */ }
    return { status: res.status, body: json, texto };
  }
  return { base, pedir, cerrar: () => new Promise((r) => server.close(r)) };
}

module.exports = { iniciarServidor };
