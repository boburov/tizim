/**
 * DASHBOARD MA'LUMOT SHARTNOMASI TEKSHIRUVI.
 *
 * NEGA BU ALOHIDA SKRIPT: bu yerdagi xato YIQILMAYDI - u ekranga
 * YOLG'ON RAQAM chiqaradi. So'rov yiqilganda "0 so'm tushum" ko'rsatish
 * hech qanday xato belgisi bermaydi va owner uni fakt deb o'qiydi.
 * Aynan shu sababdan `dataStatus.js` mantiqiga alohida tekshiruv bor.
 *
 * Client'da test freymvorki yo'q, shuning uchun `check-contrast.mjs` va
 * `check-ai-metrics.mjs` naqshiga ergashamiz: oddiy node skripti, nolga
 * teng bo'lmagan exit kod.
 *
 * `dataStatus.js` SOF JS - JSX ham, `@/` aliasi ham yo'q, shuning uchun
 * uni to'g'ridan-to'g'ri import qilsa bo'ladi (qo'shni skriptlardagi
 * "manbani birlashtirish" hiylasi bu yerda kerak emas).
 *
 * ISHLATISH:  npm run check:data-contract
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {
  DATA_STATUS: S, fromQuery, narrow, combineStatus, isEmptyResult, fromValue,
} = await import(
  path.join(HERE, "..", "src", "shared", "components", "dashboard", "dataStatus.js")
);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — kutilgan "${want}", olingan "${got}"`); }
};

console.log("\n=== DASHBOARD MA'LUMOT SHARTNOMASI ===");
console.log("\n1) fromQuery — TanStack holatlari");
eq("yuklanmoqda", fromQuery({ isLoading: true, fetchStatus: "fetching" }).status, S.LOADING);
eq("enabled:false (idle)", fromQuery({ fetchStatus: "idle", data: undefined }).status, S.IDLE);
eq("tarmoq xatosi -> error", fromQuery({ isError: true, error: { response: { status: 500 } }, fetchStatus: "idle" }).status, S.ERROR);
eq("404 -> ulanmagan", fromQuery({ isError: true, error: { response: { status: 404 } }, fetchStatus: "idle" }).status, S.NOT_CONNECTED);
eq("501 -> ulanmagan", fromQuery({ isError: true, error: { response: { status: 501 } }, fetchStatus: "idle" }).status, S.NOT_CONNECTED);
eq("404 lekin o'chirilgan -> error", fromQuery({ isError: true, error: { response: { status: 404 } }, fetchStatus: "idle" }, { notConnectedOn: [] }).status, S.ERROR);
eq("bo'sh massiv -> empty", fromQuery({ data: [], fetchStatus: "idle" }).status, S.EMPTY);
eq("ma'lumot bor -> ready", fromQuery({ data: { a: 1 }, fetchStatus: "idle" }).status, S.READY);
eq("emptyWhen shartli", fromQuery({ data: { buckets: [] }, fetchStatus: "idle" }, { emptyWhen: (d) => !d?.buckets?.length }).status, S.EMPTY);

console.log("\n2) ORQA FONDA qayta so'rov yiqildi, kesh bor");
const r = fromQuery({ isError: true, error: { response: { status: 500 } }, data: { a: 1 }, fetchStatus: "idle" });
eq("eski keshni ISHONCHLI ko'rsatmaydi", r.status, S.ERROR);

console.log("\n3) isEmptyResult — 0 va false BO'SH EMAS");
eq("0 bo'sh emas", isEmptyResult(0), false);
eq("false bo'sh emas", isEmptyResult(false), false);
eq("null bo'sh", isEmptyResult(null), true);
eq("[] bo'sh", isEmptyResult([]), true);
eq("{} bo'sh", isEmptyResult({}), true);
eq("Date bo'sh emas", isEmptyResult(new Date()), false);

console.log("\n4) narrow — qism-maydon holati");
const ok = { status: S.READY, data: { attendanceGauge: { rate: null } }, error: null };
eq("rate=null -> empty", narrow(ok, (d) => d.attendanceGauge, { emptyWhen: (g) => g?.rate == null }).status, S.EMPTY);
eq("rate=85 -> ready", narrow({ ...ok, data: { attendanceGauge: { rate: 85 } } }, (d) => d.attendanceGauge, { emptyWhen: (g) => g?.rate == null }).status, S.READY);
eq("ota xato -> meros", narrow({ status: S.ERROR, data: null }, (d) => d?.x).status, S.ERROR);
eq("ota ulanmagan -> meros", narrow({ status: S.NOT_CONNECTED, data: null }, (d) => d?.x).status, S.NOT_CONNECTED);
eq("filtr bo'sh natija -> empty", narrow({ status: S.READY, data: [1,2,3] }, (a) => a.filter((x) => x > 9)).status, S.EMPTY);

console.log("\n5) combineStatus — ustunlik tartibi");
eq("xato hammadan ustun", combineStatus(S.READY, S.ERROR, S.LOADING), S.ERROR);
eq("ulanmagan > yuklanmoqda", combineStatus(S.READY, S.NOT_CONNECTED, S.LOADING), S.NOT_CONNECTED);
eq("hammasi bo'sh -> empty", combineStatus(S.EMPTY, S.EMPTY), S.EMPTY);
eq("aralash -> ready", combineStatus(S.READY, S.EMPTY), S.READY);

console.log("\n6) fromValue — statik manba");
eq("undefined -> idle", fromValue(undefined).status, S.IDLE);
eq("0 -> ready", fromValue(0).status, S.READY);
eq("[] -> empty", fromValue([]).status, S.EMPTY);
eq("connected:false", fromValue(5, { connected: false }).status, S.NOT_CONNECTED);

console.log(`\n=== NATIJA: ${pass} o'tdi, ${fail} yiqildi ===\n`);
process.exit(fail ? 1 : 0);
