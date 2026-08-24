/**
 * MUZLATILGAN EXPRESS ORACLE'ini qayta ijro etadi.
 *
 * ⚠ Bu Express kodi EMAS — `server_legacy/src/helpers/*` o'chirilgan.
 * `express-education.json` da har bir chaqiruv `modul.funksiya(argumentlar)`
 * kaliti bilan yozib olingan. Kirish o'zgarsa oracle'da kalit topilmaydi
 * va test JIMGINA yashil qolmaydi — ATAYLAB xato tashlanadi.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORACLE = JSON.parse(readFileSync(path.join(HERE, '../express-education.json'), 'utf8'));

export const konst = (key) => ORACLE.consts[key];

export const replay = (ns, name) => (...args) => {
  const key = `${ns}.${name}(${JSON.stringify(args)})`;
  const rec = ORACLE.calls[key];
  if (!rec) throw new Error(`ORACLE'DA YO'Q: ${key} — kirishlar ro'yxati o'zgargan bo'lishi mumkin`);
  if (rec.undef) return undefined;
  if (rec.err) {
    const e = new Error(rec.err.message);
    if (rec.err.statusCode != null) e.statusCode = rec.err.statusCode;
    throw e;
  }
  return rec.ok;
};
