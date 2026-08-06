/**
 * Limpieza de DESCRIPCIONES de experiencias (agosto 2026):
 *
 * · Se quitan la DURACIÓN y los PRECIOS del texto: viven en los campos
 *   estructurados (durationMinutes, basePrice, priceVariants) y el bot y la
 *   landing los toman de ahí. Tenerlos duplicados en el texto ya causó
 *   inconsistencias (Taller mensual: $65.000 en el texto vs $75.000 real).
 * · Se reescriben con saltos de línea reales (venían "de corrido"): el bot
 *   y la landing muestran bloques legibles.
 * · Los precios que estaban SOLO en el texto no se pierden:
 *   - Facilitadores: $42.000 por persona → pasa a basePrice.
 *   - Escuelita: dos hermanos $110.000/mes → variante FLAT informativa.
 * · Antes de esto se tomó backup completo: backups/experiences-2026-08-06.json.
 *
 * El script además CAPTURA todo precio ($X) presente en las descripciones
 * actuales y lo compara contra los campos estructurados (análisis pedido por
 * el equipo), mostrando coincidencias y conflictos.
 *
 * Uso (desde la carpeta del backend):
 *   node scripts/clean-experience-descriptions.js            -> dry-run + análisis
 *   node scripts/clean-experience-descriptions.js --apply    -> escribe de verdad
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

// ── Descripciones nuevas, por _id ─────────────────────────────────────────

const DESCRIPTIONS = {
  // Arte & Degustación
  '6a480b7310d953db9a8c0bf6': `🎨 Arte & Degustación ✨
Vení a pintar una pieza, relajarte y disfrutar de una experiencia creativa, sin necesidad de experiencia previa 💛

Incluye:
✔ 1 pieza a elección:
• Cerámica (tazas, cuencos, platitos y más) — esmaltado y horneado incluido, entrega entre 1 y 2 semanas
• Para llevar en el día: cuadros, figuras de yeso, tote bags y más
✔ Todos los materiales
✔ Acompañamiento durante toda la experiencia
✔ Buffet libre dulce y salado + infusiones libres`,

  // Cerámica & Brunch
  '6a480b7410d953db9a8c0bf7': `🏺✨ Cerámica & Brunch
Elegí una pieza fresca de nuestro catálogo y personalizala con texturas, sellos y distintas técnicas decorativas. Cada pieza es única y forma parte de nuestro proceso de producción artesanal ✨

Incluye:
✔ 1 pieza a elección entre los modelos disponibles el día de tu visita (tazas, cuencos, azucareras y más)
✔ Todos los materiales
✔ Acompañamiento durante toda la experiencia
✔ Buffet libre dulce y salado + infusiones libres

🔥 Entrega de la pieza: 4 semanas`,

  // Cerámica & Brunch Premium
  '6a480b7410d953db9a8c0bf8': `🏺 Cerámica & Brunch Premium
Creá tu propia pieza de cerámica desde cero, sin experiencia previa 💛

Incluye:
✔ Modelado en arcilla
✔ Todos los materiales
✔ Acompañamiento paso a paso
✔ Buffet libre dulce y salado + infusiones libres

🔥 Entrega de la pieza: 3 a 4 semanas`,

  // Cumpleaños (ocasión: beneficios y precios viven en priceVariants y en la
  // experiencia elegida; la leyenda vencida "no válido del 20/7 al 1/08" y los
  // precios de otras experiencias se van del texto)
  '6a480b7510d953db9a8c0bf9': `🎉✨ Cumpleaños y Eventos en Mística Auténtica ✨🎉
Celebrá de una forma diferente: elegís la experiencia que más te guste para el festejo y nosotros armamos todo, con merienda incluida y espacio para compartir 💛

🍰 Todas las propuestas incluyen buffet libre dulce y salado
📍 Nicolás Videla 57, Quilmes Centro
🏛 Capacidad hasta 40 personas
💳 Reserva con seña del 50% · tarjeta disponible (consultar recargo)`,

  // Escuelita de arte (online)
  '6a480b7610d953db9a8c0bfb': `🎨✨ ESCUELITA DE ARTE MÍSTICA (niños)
Un espacio creativo donde los chicos pueden experimentar distintas técnicas artísticas, desarrollar su imaginación y aprender cerámica, pintura y más, en un ambiente cuidado y acompañado.

¿Qué hacemos en las clases? (edad sugerida: 7 a 13 años)
🏺 Modelar y pintar cerámica
🎨 Pintar cuadros
🖌️ Pintar piezas de yeso
✨ Explorar distintos materiales y soportes artísticos
Trabajamos con un programa rotativo para que siempre aprendan algo nuevo.

🕕 Miércoles de 18:00 a 19:45 hs

Incluye:
✔ Todos los materiales
✔ Acompañamiento de profes
✔ Grupos reducidos
✔ Merienda compartida
✔ Piezas de cerámica con horneado incluido`,

  // Taller mensual de cerámica (doc nuevo, $75.000)
  '6a4ced28f06ad995bfb43a1e': `🌙✨ Taller mensual de cerámica
Un espacio para encontrarte con la arcilla, tu creatividad y la calma de crear con tus manos. En cada clase compartimos técnicas de cerámica y algo rico para acompañar + infusiones libres ✨

📅 Días y horarios:
• Martes 18 a 20 hs
• Miércoles 15:30 a 17:30 hs
• Jueves 15:30 a 17:30 hs
• Jueves 18 a 20 hs
• Viernes 18 a 20 hs

🌱 Incluye materiales libres, guía y horneadas
🌸 Grupos reducidos para mejor atención
📍 Videla 57, Quilmes Centro
Seña del 50% y el resto antes del día 10.

✨ Podés venir a probar una clase sin compromiso: la primera es gratis, para conocer el espacio y la dinámica.
💫 Importante: la clase de prueba se reserva con anticipación; si no venís sin avisar se pierde el beneficio y, para sumarte después, se abona el valor completo.`,

  // NOTA: los docs viejos (Taller mensual $2, Escuelita vieja, Facilitadores,
  // Tienda) tienen deletedAt: null — el filtro `deletedAt: {$exists: false}`
  // del backend ya los OCULTA del catálogo, así que no se tocan.
};

// Precio que estaba SOLO en el texto y se rescata a campo estructurado.
const ESCUELITA_ID = '6a480b7610d953db9a8c0bfb';
const ESCUELITA_VARIANT = {
  name: 'Dos hermanos (mensual)',
  price: 110000,
  unit: 'FLAT',
  description: 'Valor mensual por dos hermanos',
  active: true,
};

// ── Infra ─────────────────────────────────────────────────────────────────

function loadMongo() {
  const nestMongoose = require.resolve('@nestjs/mongoose', {
    paths: [path.join(__dirname, '..')],
  });
  const m = require.resolve('mongodb', { paths: [nestMongoose] });
  return require(m);
}

function readDatabaseUrl() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error('No se encontró DATABASE_URL en .env');
}

// Captura "$42.000", "$ 66.000", "$110.000" → números.
function capturePrices(text) {
  const out = [];
  for (const m of (text || '').matchAll(/\$\s?(\d[\d.,]*)/g)) {
    const n = Number(m[1].replace(/[.,]/g, ''));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

async function main() {
  const { MongoClient } = loadMongo();
  const url = readDatabaseUrl();
  console.log(
    APPLY ? '⚠️  MODO APPLY (se escribirá en la base)' : 'Modo dry-run',
  );

  const client = new MongoClient(url);
  await client.connect();
  try {
    const col = client.db().collection('experiences');
    const docs = await col
      .find({ deletedAt: { $exists: false } })
      .toArray();

    console.log('\n══ ANÁLISIS DE PRECIOS EN DESCRIPCIONES ══');
    for (const d of docs) {
      const captured = capturePrices(d.description);
      if (!captured.length) continue;
      const known = new Set([
        d.basePrice,
        ...(d.priceVariants || []).map((v) => v.price).filter((p) => p != null),
      ]);
      const marks = captured.map((p) => {
        if (known.has(p)) return `$${p} ✓ (coincide con campo estructurado)`;
        return `$${p} ⚠ SOLO en el texto`;
      });
      console.log(`\n· ${d.name} (base $${d.basePrice}):`);
      for (const m of marks) console.log(`   ${m}`);
    }

    console.log('\n══ CAMBIOS ══');
    for (const d of docs) {
      const nueva = DESCRIPTIONS[String(d._id)];
      if (!nueva) continue;
      const update = { description: nueva, updatedAt: new Date() };
      const extras = [];
      if (String(d._id) === ESCUELITA_ID) {
        const vars = d.priceVariants || [];
        if (!vars.some((v) => v.name === ESCUELITA_VARIANT.name)) {
          update.priceVariants = [...vars, ESCUELITA_VARIANT];
          extras.push(`+ variante "${ESCUELITA_VARIANT.name}" $${ESCUELITA_VARIANT.price} (FLAT informativa)`);
        }
      }
      console.log(
        `· ${d.name}: descripción reescrita (${(d.description || '').length} -> ${nueva.length} chars)${extras.length ? ' · ' + extras.join(' · ') : ''}`,
      );
      if (APPLY) await col.updateOne({ _id: d._id }, { $set: update });
    }

    console.log(
      APPLY ? '\nListo: descripciones limpias.' : '\nDry-run: no se escribió nada.',
    );
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
