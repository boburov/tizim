// Icons
import { TriangleAlert } from "lucide-react";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

/**
 * YAKKA MARKAZ REJIMI + bazada bir nechta filial = ogohlantirish.
 *
 * NEGA kerak: bu holatda server hamma so'rovni ASOSIY filialga qisqartiradi.
 * Ya'ni o'quvchilar ro'yxati ham, daromad hisoboti ham qolgan filiallarni
 * QAMRAMAYDI. Ogohlantirishsiz ega to'liq bo'lmagan raqamni markazning
 * umumiy natijasi deb o'qib qolardi - bu eng xavfli jimlik.
 *
 * Ma'lumot o'chmaydi: bayroq faqat o'qish ko'lami, MULTI_BRANCH=true
 * qilinsa hammasi qaytadi.
 */
const BranchModeBanner = () => {
  const { multiBranch, branchCount, isOwner } = useAuth();

  // Faqat egaga: xodim baribir bu sozlamani o'zgartira olmaydi.
  if (multiBranch || !isOwner || branchCount <= 1) return null;

  const frozen = branchCount - 1;

  return (
    <div className="flex items-start gap-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
      <p>
        <span className="font-medium">Yakka markaz rejimi.</span> Faqat asosiy
        filial ko'rsatilmoqda — qolgan {frozen} ta filial muzlatilgan va
        hisobotlarga kirmaydi. Ma'lumot o'chmagan: ko'p filialli rejimga
        qaytarilsa hammasi tiklanadi.
      </p>
    </div>
  );
};

export default BranchModeBanner;
