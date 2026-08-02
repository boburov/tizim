import { FileSpreadsheet } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ExportModal from "./ExportModal";

// Hooks
import useModal from "@/shared/hooks/useModal";

/**
 * "Excel" tugmasi + uning modali (o'zi bilan birga mount qilinadi).
 *
 * NEGA ModalWrapper shu yerda (odatdagidek sahifada emas): tugma va
 * uning oynasi bitta bo'lak - sahifaga faqat <ExportButton /> qo'yiladi
 * va wrapper'ni mount qilishni unutib bo'lmaydi.
 *
 * NEGA modal nomi datasetKey'dan yasaladi: CreateModals.jsx'dagi
 * ogohlantirish - bir xil nomdagi ModalWrapper ikki marta mount
 * qilinsa, bitta openModal ikkita dialog ochadi. Nomni dataset'ga
 * bog'lash turli hisobotlarni ajratadi (to'lovlar va o'qituvchilar).
 * DIQQAT: bitta sahifaga BIR XIL datasetKey bilan ikkita tugma
 * qo'yilmasin - o'shanda nomlar to'qnashadi.
 *
 * Props:
 *   datasetKey - server reyestridagi kalit ("student-payments", "teachers")
 *   filters    - jadvalning joriy filtrlari (page/limit YUBORILMAYDI:
 *                eksport butun natijani oladi, ko'rinib turgan sahifani emas)
 */
const ExportButton = ({
  datasetKey,
  filters = {},
  title = "Excelga yuklash",
  size = "sm",
  variant = "outline",
  disabled = false,
}) => {
  const modalName = `export:${datasetKey}`;
  const { openModal } = useModal(modalName);

  return (
    <>
      <Button
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => openModal(modalName, { datasetKey, filters })}
      >
        <FileSpreadsheet className="size-4" />
        Excel
      </Button>

      <ModalWrapper
        name={modalName}
        title={title}
        description="Kerakli ustunlarni tanlang"
      >
        <ExportModal />
      </ModalWrapper>
    </>
  );
};

export default ExportButton;
