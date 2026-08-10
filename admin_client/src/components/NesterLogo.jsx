import { useId } from 'react';

/**
 * Nester brend belgisi.
 *
 * MA'NOSI:
 *   yumaloq idish  — control plane: platforma hamma tenantni o'z ichiga oladi
 *   ichidagi "N"   — brend harfi; ikki ustun orasidagi diagonal lenta
 *                    ular orasidagi oqimni (provisioning) bildiradi
 *
 * NEGA MONOGRAMMA, "uy/qush uyasi" rasmi emas: uya, qatlam yoki halqa
 * shaklidagi belgilar sinab ko'rilganda 20px da yuzga, kamera obyektiviga
 * yoki loading-spinnerga o'xshab ketdi — ya'ni tasodifiy o'qilish asosiy
 * ma'noni bosib ketdi. Idish + harf esa bunday xatoga yo'l qo'ymaydi va
 * belgi Nester'ning O'ZINIKI bo'ladi: ichma-ich kvadratlarni istalgan
 * mahsulot ishlatishi mumkin, N ni esa yo'q.
 *
 * NEGA ATIGI 2 ELEMENT: belgi 16-20px favicon o'lchamida ham tanilishi
 * kerak. O'sha o'lchamda har bir qo'shimcha detal loyqaga aylanadi.
 *
 * NEGA GRADIENT ID'lari `useId()` orqali: SVG gradientlari hujjat bo'yicha
 * global. Logo sahifada ikki marta chiqsa (sidebar + modal), qattiq yozilgan
 * id'lar to'qnashib, ikkinchi nusxa birinchisining gradientini o'g'irlaydi.
 *
 * Ranglar tema tokenlariga bog'lanmagan (ataylab): bu brend belgisi, u light
 * va dark rejimda bir xil bo'lishi kerak. Binafsha gradient oq fonda ham,
 * to'q fonda ham ajralib turadi.
 */
export default function NesterLogo({ size = 32, className, title = 'Nester' }) {
  const uid = useId();
  const shell = `${uid}-shell`; // tashqi idish
  const letter = `${uid}-letter`; // ichkaridagi N

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        {/* Asosiy "suyuq" gradient: siyohrangdan indigoga, diagonal bo'ylab */}
        <linearGradient
          id={shell}
          x1="2"
          y1="2"
          x2="30"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>

        {/* Harf ochroq va gradienti TESKARI yo'nalishda — shu qarama-qarshilik
            ikki qatlam orasida chuqurlik beradi, "suyuqlik ustma-ust oqqan"
            taassuroti shundan keladi */}
        <linearGradient
          id={letter}
          x1="22"
          y1="9"
          x2="10"
          y2="23"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#F5D0FE" />
          <stop offset="55%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>

      {/* Idish — platforma */}
      <rect
        x="1.6"
        y="1.6"
        width="28.8"
        height="28.8"
        rx="9"
        stroke={`url(#${shell})`}
        strokeWidth="3.1"
      />

      {/* N — brend; diagonal ikki ustun orasidagi oqim */}
      <path
        d="M10.4 22V10l11.2 12V10"
        stroke={`url(#${letter})`}
        strokeWidth="3.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
