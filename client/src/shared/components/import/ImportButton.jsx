import { Upload } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ImportModal from "./ImportModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import { useImportersQuery } from "@/shared/hooks/useImport";

/**
 * "Excel'dan yuklash" tugmasi + import ustasi.
 *
 * ExportButton bilan bir xil naqsh: modal nomi importerKey'dan yasaladi,
 * shuning uchun turli importlar to'qnashmaydi. Bitta sahifaga BIR XIL
 * importerKey bilan ikkita tugma qo'yilmasin.
 *
 * Tugma RUXSAT bo'lmasa umuman ko'rinmaydi: importerlar ro'yxati serverda
 * ruxsat bo'yicha filtrlanadi, shuning uchun bu yerda alohida tekshiruv
 * shart emas - ro'yxatda yo'q bo'lsa, huquq ham yo'q.
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

  const allowed = (importers || []).some((i) => i.key === importerKey);
  if (!allowed) return null;

  return (
    <>
      <Button size={size} variant={variant} onClick={() => openModal(modalName, { importerKey })}>
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
