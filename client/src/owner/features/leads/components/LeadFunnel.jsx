import Card from "@/shared/components/ui/card/Card";
import { LEAD_STATUS_LABEL } from "@/shared/constants/leadStatus";

// VORONKA RANGLARI - bosqich chuqurlashgani sari to'qlashadi (ko'k-yashildan
// binafshagacha), shunda "pastga tushish" ko'z bilan o'qiladi.
//
// NEGA HEX, Tailwind sinfi emas: bu SVG `fill` qiymati - `fill` atributiga
// sinf berib bo'lmaydi. Ranglar ikkala temada ham BIR XIL qoladi (voronka o'z
// fonini o'zi olib yuradi), va hammasi OQ matn bilan 4.5:1 dan yuqori kontrast
// beradi - band ichidagi yozuv ikkala temada ham o'qiladi.
const STAGE_COLORS = ["#0f766e", "#0369a1", "#1d4ed8", "#4338ca", "#6d28d9"];

// SVG koordinata tizimi. Konteyner kengligiga `viewBox` orqali moslashadi,
// shuning uchun bu sonlar piksel emas - nisbat.
const VB_W = 400;
const VB_H = 250;
const PAD_X = 6;
const CX = VB_W / 2;
const MAX_HALF = (VB_W - PAD_X * 2) / 2;

// ENG TOR BANDNING ULUSHI.
//
// Bandlar ichida MATN turadi ("Sinovda qatnashdi"), shuning uchun voronka
// nolgacha ingichkalashib keta olmaydi - aks holda oxirgi bosqichlarning
// yozuvi sig'masdi. Kenglik shu polga qarab chiziladi:
//     kenglik = FLOOR + (1 - FLOOR) * (soni / eng_katta)
//
// Bu SHAKLNI o'qishga moslashtiradi, RAQAMNI emas: har bandda aniq son va
// foiz yozib qo'yilgan, hover'da esa to'liq izoh chiqadi. Bandlar orasidagi
// nisbat ham saqlanadi - kattaroq bosqich har doim kengroq ko'rinadi.
// Soni 0 bo'lsa band butunlay yo'qoladi (pol qo'llanmaydi) - "0 ta"ni
// kenglik bilan ko'rsatish yolg'on bo'lardi.
const FLOOR = 0.38;

const LeadFunnel = ({ funnel = [], rates }) => {
  const isEmpty = funnel.length === 0 || funnel.every((f) => !f.count);

  // Eng katta bosqich = voronkaning eng keng joyi. Voronka KUMULYATIV
  // (har bosqich "shu yergacha yetganlar soni"), ya'ni qiymatlar monoton
  // kamayadi va birinchi band har doim eng keng bo'ladi.
  const max = Math.max(1, ...funnel.map((f) => f.count));
  const bandH = VB_H / Math.max(1, funnel.length);
  const halfOf = (count) =>
    count > 0 ? (FLOOR + (1 - FLOOR) * (count / max)) * MAX_HALF : 0;

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return (
    <Card title="Savdo voronkasi" className="space-y-4">
      {isEmpty ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Ma'lumot yo'q
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="mt-4 w-full"
          role="img"
          aria-label="Lidlarning bosqichma-bosqich voronkasi"
        >
          {funnel.map((f, i) => {
            const prev = funnel[i - 1];
            const next = funnel[i + 1];

            // Bandning yuqori qirrasi - shu bosqich soni, pastki qirrasi -
            // KEYINGI bosqich soni. Shu sababli yon tomonlarning qiyaligi
            // aynan yo'qotish tezligini chizadi. Oxirgi band uchun keyingi
            // bosqich yo'q - u to'g'ri "quvur" bo'lib tugaydi.
            const top = halfOf(f.count);
            const bottom = halfOf(next ? next.count : f.count);
            const y0 = i * bandH;
            const mid = y0 + bandH / 2;

            // Oldingi bosqichdan o'tish ulushi - voronkaning eng gapiruvchi
            // ko'rsatkichi ("100 tadan 62 tasi keyingi bosqichga o'tdi").
            // Umumiy ulush (f.rate) kenglik orqali allaqachon ko'rinib
            // turibdi, shuning uchun bandga aynan SHU foiz yoziladi.
            const step = prev ? pct(f.count, prev.count) : null;
            const label = LEAD_STATUS_LABEL[f.stage] || f.stage;

            return (
              <g key={f.stage}>
                <polygon
                  points={[
                    `${CX - top},${y0}`,
                    `${CX + top},${y0}`,
                    `${CX + bottom},${y0 + bandH}`,
                    `${CX - bottom},${y0 + bandH}`,
                  ].join(" ")}
                  fill={STAGE_COLORS[i % STAGE_COLORS.length]}
                  stroke="hsl(var(--card))"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                >
                  <title>
                    {`${label}: ${f.count} ta - jamidan ${f.rate}%` +
                      (step === null ? "" : `, oldingi bosqichdan ${step}%`)}
                  </title>
                </polygon>

                {f.count > 0 && (
                  <text
                    x={CX}
                    textAnchor="middle"
                    fill="#ffffff"
                    pointerEvents="none"
                  >
                    <tspan x={CX} y={mid - 7} fontSize="13" fontWeight="600">
                      {label}
                    </tspan>
                    <tspan x={CX} y={mid + 11} fontSize="11" opacity="0.9">
                      {`${f.count} ta`}
                      {step === null ? "" : `  ·  ↓ ${step}%`}
                    </tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {rates && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>
            Lid → Sinov: <b className="text-foreground">{rates.leadToTrial}%</b>
          </span>
          <span>
            Sinov → To'lov:{" "}
            <b className="text-foreground">{rates.trialToEnrolled}%</b>
          </span>
          <span>
            Umumiy konversiya:{" "}
            <b className="text-foreground">{rates.overallConversion}%</b>
          </span>
        </div>
      )}
    </Card>
  );
};

export default LeadFunnel;
