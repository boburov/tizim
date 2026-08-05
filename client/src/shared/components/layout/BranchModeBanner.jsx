// Icons
import { TriangleAlert } from "lucide-react";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { ROLES } from "@/shared/constants/roles";

const Banner = ({ children }) => (
  <div className="flex items-start gap-2 rounded-sm border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-300">
    <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
    <p>{children}</p>
  </div>
);

/**
 * FILIAL HOLATI HAQIDAGI OGOHLANTIRISHLAR.
 *
 * 1) FILIAL YO'Q. Foydalanuvchi uchun birorta ham filial ko'rinmaydi.
 *    Bu holatda ro'yxatlar bo'sh, yaratish esa serverda "filial
 *    tanlanmagan" bilan tugaydi - sababni AYTMASLIK eng yomoni edi:
 *    ekran shunchaki bo'sh turardi.
 *
 * 2) YAKKA MARKAZ REJIMI + bazada bir nechta filial. Bu holatda server
 *    hamma so'rovni ASOSIY filialga qisqartiradi, ya'ni o'quvchilar
 *    ro'yxati ham, daromad hisoboti ham qolgan filiallarni QAMRAMAYDI.
 *    Ogohlantirishsiz ega to'liq bo'lmagan raqamni markazning umumiy
 *    natijasi deb o'qib qolardi. Ma'lumot o'chmaydi: bayroq faqat o'qish
 *    ko'lami, MULTI_BRANCH=true qilinsa hammasi qaytadi.
 */
const BranchModeBanner = () => {
  const { multiBranch, branches, branchCount, isOwner, roleType, isLoading } =
    useAuth();

  // O'quvchiga filial tushunchasi umuman ko'rsatilmaydi - u faqat o'z
  // guruhini ko'radi, filial esa ma'muriy tushuncha.
  const isStudent = roleType === ROLES.STUDENT;

  if (!isLoading && !isStudent && branches.length === 0) {
    return (
      <Banner>
        <span className="font-medium">Filial topilmadi.</span>{" "}
        {isOwner
          ? "Markazda faol filial yo'q - ro'yxatlar bo'sh ko'rinadi va yangi yozuv yaratib bo'lmaydi. «Filiallar» bo'limidan filial oching yoki arxivdagisini tiklang."
          : "Sizga hech qanday filial biriktirilmagan - shu sababli ma'lumotlar ko'rinmaydi. Administratorga murojaat qiling."}
      </Banner>
    );
  }

  // Faqat egaga: xodim baribir bu sozlamani o'zgartira olmaydi.
  if (multiBranch || !isOwner || branchCount <= 1) return null;

  const frozen = branchCount - 1;

  return (
    <Banner>
      <span className="font-medium">Yakka markaz rejimi.</span> Faqat asosiy
      filial ko'rsatilmoqda — qolgan {frozen} ta filial muzlatilgan va
      hisobotlarga kirmaydi. Ma'lumot o'chmagan: ko'p filialli rejimga
      qaytarilsa hammasi tiklanadi.
    </Banner>
  );
};

export default BranchModeBanner;
