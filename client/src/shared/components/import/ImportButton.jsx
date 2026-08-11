import { Upload } from "lucide-react";
import { Link } from "react-router-dom";

// Components
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ImportModal from "./ImportModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import { useImportersQuery } from "@/shared/hooks/useImport";

/**
 * "Excel'dan yuklash" tugmasi.
 *
 * IKKI XIL OQIM, ikki xil joy:
 *
 *   gridEnabled=true  (odam importi) → ALOHIDA SAHIFA.
 *     Bu yerda foydalanuvchi o'nlab qatorni ko'zdan kechiradi, guruh
 *     biriktiradi, xatolarni tuzatadi. Modal ichida jadvalga ekranning
 *     yarmi ham tegmasdi va ish qiynalardi.
 *
 *   gridEnabled=false (to'lov importi) → OYNA.
 *     Ikki qadamlik tasdiq (fayl → ko'rib chiqish → saqlash). Buning
 *     uchun sahifa ochish ortiqcha - kontekst yo'qoladi.
 *
 * Bayroq SERVERDAN keladi, client'da qattiq yozilmaydi: yangi importer
 * qo'shilganda bu faylga qaytib kelish shart emas.
 *
 * Tugma RUXSAT bo'lmasa umuman ko'rinmaydi - importerlar ro'yxati
 * serverda ruxsat bo'yicha filtrlanadi, ro'yxatda yo'q bo'lsa huquq
 * ham yo'q.
 */
const ImportButton = ({
  importerKey,
  title = "Excel'dan yuklash",
  size = "sm",
  variant = "outline",
}) => {
  const modalName = `import:${importerKey}`;
  const { openModal } = useModal(modalName);
  const { data: importers } = useImportersQuery();

  const importer = (importers || []).find((i) => i.key === importerKey);
  if (!importer) return null;

  if (importer.gridEnabled) {
    return (
      <Button asChild size={size} variant={variant}>
        <Link to={`/owner/import/${importerKey}`}>
          <Upload className="size-4" />
          Excel'dan yuklash
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={() => openModal(modalName, { importerKey })}
      >
        <Upload className="size-4" />
        Excel'dan yuklash
      </Button>

      <ModalWrapper
        name={modalName}
        title={title}
        description="Ma'lumot avval tekshiriladi, keyin siz tasdiqlaganingizda saqlanadi"
        className="max-w-5xl"
      >
        <ImportModal />
      </ModalWrapper>
    </>
  );
};

export default ImportButton;
