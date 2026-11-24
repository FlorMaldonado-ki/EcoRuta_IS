'use strict';
/**
 * Genera el SQL del catálogo de vehículos a partir de NHTSA vPIC
 * (https://vpic.nhtsa.dot.gov/api/, API pública del gobierno de EE. UU.).
 *
 *   node db/catalogos/importar-vpic.js > db/migrations/014_catalogo_vehiculos_vpic.sql
 *   node db/catalogos/importar-vpic.js --desde 1995 --hasta 2027 > ...
 *
 * La salida es una migración más (filas con ON CONFLICT DO NOTHING): revísala,
 * commitéala y aplícala con `npm run db:migrate`. Para actualizar el catálogo
 * después, genera otra con el siguiente número; nunca edites una ya aplicada.
 * Tarda unos minutos: vPIC bloquea por un rato la IP si recibe muchas
 * peticiones seguidas (HTTP 403), por eso la concurrencia es baja.
 *
 * Limitación conocida: vPIC cubre el mercado de EE. UU. Modelos que solo se
 * venden en México (p. ej. versiones nacionales) pueden no aparecer; se
 * agregan con fuente = 'manual' desde una fuente verificable (INEGI RAIAVL,
 * ficha técnica del fabricante).
 */

const BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

/** Marcas con venta en México. El nombre a la izquierda es el que guarda la BD. */
const MARCAS = {
  Acura: 'acura', 'Alfa Romeo': 'alfa romeo', Audi: 'audi', BMW: 'bmw', Buick: 'buick',
  BYD: 'byd', Cadillac: 'cadillac', Chevrolet: 'chevrolet', Chrysler: 'chrysler', Dodge: 'dodge',
  Fiat: 'fiat', Ford: 'ford', GMC: 'gmc', Honda: 'honda', Hyundai: 'hyundai', Infiniti: 'infiniti',
  Jaguar: 'jaguar', Jeep: 'jeep', Kia: 'kia', 'Land Rover': 'land rover', Lincoln: 'lincoln',
  Mazda: 'mazda', 'Mercedes-Benz': 'mercedes-benz', MG: 'mg', Mini: 'mini', Mitsubishi: 'mitsubishi',
  Nissan: 'nissan', Peugeot: 'peugeot', Porsche: 'porsche', Ram: 'ram', Renault: 'renault',
  SEAT: 'seat', Subaru: 'subaru', Suzuki: 'suzuki', Tesla: 'tesla', Toyota: 'toyota',
  Volkswagen: 'volkswagen', Volvo: 'volvo',
};

/** Tipo de vPIC → clave del catálogo. */
const TIPOS = {
  'passenger car': 'automovil',
  'multipurpose passenger vehicle (mpv)': 'suv',
  truck: 'pickup',
};

const arg = (nombre, defecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? Number(process.argv[i + 1]) : defecto;
};
const DESDE = arg('desde', 1995);
const HASTA = arg('hasta', new Date().getFullYear() + 1);
const CONCURRENCIA = 2;
const PAUSA_MS = 150; // vPIC responde 403 si se le satura

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, intentos = 6) {
  for (let i = 1; ; i++) {
    try {
      await esperar(PAUSA_MS);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).Results || [];
    } catch (err) {
      if (i >= intentos) throw new Error(`${url}: ${err.message}`);
      await esperar(2000 * 2 ** (i - 1));
    }
  }
}

/** Ejecuta las tareas con un máximo de N en paralelo. */
async function enLotes(tareas, n) {
  const resultados = [];
  let siguiente = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      resultados[i] = await tareas[i]();
    }
  }));
  return resultados;
}

/** Recorta espacios repetidos; vPIC a veces trae "Model  Name ". */
const limpiar = (s) => String(s).replace(/\s+/g, ' ').trim();
const sqlTexto = (s) => `'${s.replace(/'/g, "''")}'`;

/** [2001,2002,2003,2007] → [[2001,2003],[2007,2007]] */
function rangos(anios) {
  const ord = [...anios].sort((a, b) => a - b);
  const out = [];
  for (const a of ord) {
    const ultimo = out[out.length - 1];
    if (ultimo && a === ultimo[1] + 1) ultimo[1] = a;
    else out.push([a, a]);
  }
  return out;
}

async function main() {
  // 1) Modelos de cada marca por año (sin tipo) y 2) tipo de cada modelo (sin año):
  // ~3 veces menos peticiones que consultar cada combinación año × tipo.
  const url = (marca, extra) => `${BASE}/GetModelsForMakeYear/make/${encodeURIComponent(MARCAS[marca])}${extra}?format=json`;
  const tareas = [];
  for (const marca of Object.keys(MARCAS)) {
    for (let anio = DESDE; anio <= HASTA; anio++) {
      tareas.push(async () => ({ clase: 'anio', marca, anio, filas: await pedir(url(marca, `/modelyear/${anio}`)) }));
    }
    for (const [tipoVpic, tipo] of Object.entries(TIPOS)) {
      tareas.push(async () => ({ clase: 'tipo', marca, tipo, filas: await pedir(url(marca, `/vehicletype/${encodeURIComponent(tipoVpic)}`)) }));
    }
  }
  process.stderr.write(`Consultando vPIC: ${tareas.length} peticiones (${DESDE}–${HASTA})...
`);
  const respuestas = await enLotes(tareas, CONCURRENCIA);

  // vPIC compara la marca por coincidencia parcial: se descartan marcas ajenas.
  const propias = (marca, filas) => filas.filter((f) => limpiar(f.Make_Name).toLowerCase() === MARCAS[marca]);

  // "marca|Model_ID" → tipos
  const tiposDe = new Map();
  for (const r of respuestas.filter((x) => x.clase === 'tipo')) {
    for (const f of propias(r.marca, r.filas)) {
      const k = `${r.marca}|${f.Model_ID}`;
      if (!tiposDe.has(k)) tiposDe.set(k, new Set());
      tiposDe.get(k).add(r.tipo);
    }
  }

  // "tipo|marca|modelo" → años. Los modelos sin tipo reconocido (motos, remolques…) se omiten.
  const catalogo = new Map();
  const porMarca = {};
  for (const r of respuestas.filter((x) => x.clase === 'anio')) {
    for (const f of propias(r.marca, r.filas)) {
      const modelo = limpiar(f.Model_Name);
      const tipos = tiposDe.get(`${r.marca}|${f.Model_ID}`);
      if (!modelo || modelo.length > 50 || !tipos) continue;
      for (const tipo of tipos) {
        const clave = `${tipo}|${r.marca}|${modelo}`;
        if (!catalogo.has(clave)) catalogo.set(clave, new Set());
        catalogo.get(clave).add(r.anio);
      }
      porMarca[r.marca] = (porMarca[r.marca] || 0) + 1;
    }
  }

  const valores = [];
  for (const [clave, anios] of [...catalogo.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))) {
    const [tipo, marca, modelo] = clave.split('|');
    for (const [d, h] of rangos(anios)) {
      valores.push(`  (${sqlTexto(tipo)}, ${sqlTexto(marca)}, ${sqlTexto(modelo)}, ${d}, ${h})`);
    }
  }

  const sinDatos = Object.keys(MARCAS).filter((m) => !porMarca[m]);
  process.stderr.write(`Modelos (tipo+marca+modelo): ${catalogo.size} · rangos: ${valores.length}\n`);
  if (sinDatos.length) process.stderr.write(`Marcas sin datos en vPIC: ${sinDatos.join(', ')}\n`);

  const hoy = new Date().toISOString().slice(0, 10);
  process.stdout.write(`-- Generado por db/catalogos/importar-vpic.js el ${hoy} (NHTSA vPIC, años ${DESDE}–${HASTA}).
-- Marcas consultadas sin modelos en vPIC: ${sinDatos.join(', ') || 'ninguna'}.
INSERT INTO catalogo_vehiculo (tipo, marca, modelo, anio, fuente)
SELECT v.tipo, v.marca, v.modelo, gs.anio, 'nhtsa_vpic'
  FROM (VALUES
${valores.join(',\n')}
  ) AS v (tipo, marca, modelo, desde, hasta)
  CROSS JOIN LATERAL generate_series(v.desde, v.hasta) AS gs (anio)
ON CONFLICT (tipo, marca, modelo, anio) DO NOTHING;
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
