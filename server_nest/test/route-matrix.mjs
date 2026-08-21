/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MARSHRUT MATRITSASI — ikkala stekni HAQIQIY ro'yxatdan o'qiydi.
 *
 * Manba fayllardan EMAS: Express `app` ning router steki va NestJS
 * `dist/` dan ko'tarilgan ilovaning Express adapteri o'qiladi. Ya'ni
 * "modul yozilgan, lekin AppModule'ga qo'shilmagan" holat ko'rinadi.
 *
 * ISHLATISH:  node --env-file=../server/.env test/route-matrix.mjs [--json]
 * ═══════════════════════════════════════════════════════════════════════════
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPRESS_APP = pathToFileURL(path.join(HERE, '../../server/src/app.js')).href;
const NEST_DIST = pathToFileURL(path.join(HERE, '../dist/app.module.js')).href;

/** Express 4 router stekini rekursiv aylanib chiqadi. */
const expressRoutes = (stack, prefix = '') => {
  const out = [];
  for (const layer of stack) {
    if (layer.route) {
      const p = prefix + layer.route.path;
      for (const [m, on] of Object.entries(layer.route.methods)) {
        if (on && m !== '_all') out.push(`${m.toUpperCase()} ${p}`);
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      out.push(...expressRoutes(layer.handle.stack, prefix + layerPrefix(layer)));
    }
  }
  return out;
};

/** `layer.regexp` dan mount yo'lini tiklaydi (`/^\/api\/?(?=\/|$)/i` → `/api`). */
const layerPrefix = (layer) => {
  if (layer.path) return layer.path;
  const s = layer.regexp?.source ?? '';
  if (s === '^\\/?(?=\\/|$)') return '';
  const m = /^\^\\\/(.*?)\\\/\?\(\?=/.exec(s);
  return m ? '/' + m[1].replace(/\\\//g, '/') : '';
};

const norm = (r) =>
  r.replace(/:[A-Za-z0-9_]+/g, ':p').replace(/\/$/, '') || '/';

const main = async () => {
  // ── EXPRESS ──
  const { default: app } = await import(EXPRESS_APP);
  const express = [...new Set(expressRoutes(app._router.stack))].sort();

  // ── NEST (dist'dan, HTTP tinglamasdan) ──
  await import('reflect-metadata');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import(NEST_DIST);
  const nestApp = await NestFactory.create(AppModule, { logger: false });
  nestApp.setGlobalPrefix('api');
  await nestApp.init();
  const nestStack = nestApp.getHttpAdapter().getInstance()._router.stack;
  const nest = [...new Set(expressRoutes(nestStack))].sort();
  await nestApp.close();

  const eSet = new Set(express.map(norm));
  const nSet = new Set(nest.map(norm));
  const missing = [...eSet].filter((r) => !nSet.has(r)).sort();
  const extra = [...nSet].filter((r) => !eSet.has(r)).sort();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ express, nest, missing, extra }, null, 2));
  } else {
    console.log(`EXPRESS: ${express.length}`);
    console.log(`NEST   : ${nest.length}`);
    console.log(`\n── NEST'DA YO'Q (${missing.length}) ──`);
    for (const r of missing) console.log('  ' + r);
    console.log(`\n── FAQAT NEST'DA (${extra.length}) ──`);
    for (const r of extra) console.log('  ' + r);
  }
  process.exit(0);
};

main().catch((e) => { console.error(e); process.exit(1); });
