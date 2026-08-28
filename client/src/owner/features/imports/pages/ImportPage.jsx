// React
import { useMemo } from "react";

// Router
import { useNavigate, useParams } from "react-router-dom";

// Icons
import { ArrowLeft, FileSpreadsheet } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ImportWizard from "@/shared/components/import/ImportWizard";
import GroupCreateModal from "@/owner/features/groups/components/modals/GroupCreateModal";

// Hooks
import { useImportersQuery } from "@/shared/hooks/useImport";
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

// Qaysi importdan qaysi ro'yxatga qaytamiz. Import tugagach foydalanuvchi
// yaratgan odamlarini KO'RISHNI xohlaydi - brauzer tarixiga tayanib
// bo'lmaydi (sahifaga to'g'ridan-to'g'ri havola bilan ham kelinadi).
const BACK_TO = {
  students: "/owner/students",
  teachers: "/owner/teachers",
  staff: "/owner/staff",
};

/**
 * OMMAVIY IMPORT SAHIFASI (o'quvchi / o'qituvchi / xodim).
 *
 * NEGA SAHIFA: usta ilgari modal ichida edi va o'sha yerda jadvalga
 * ekranning yarmi ham tegmasdi. Import bir zumlik tasdiq emas -
 * o'nlab qatorni ko'zdan kechirib, guruh biriktirib, xatolarni
 * tuzatadigan ish. Unga to'liq kenglik kerak.
 *
 * Ruxsat ALOHIDA qo'riqlanmaydi: importerlar ro'yxati serverda ruxsat
 * bo'yicha filtrlanadi, shuning uchun huquqsiz odam uchun ro'yxat bo'sh
 * bo'ladi va usta "ruxsatingiz yo'q" deb yozadi. Yozish yo'li ham
 * server tomonda qayta tekshiriladi (requireImporterPermission).
 */
const ImportPage = () => {
  const { importerKey } = useParams();
  const navigate = useNavigate();
  const { data: importers } = useImportersQuery();
  const { has } = usePermissions();

  const importer = (importers || []).find((i) => i.key === importerKey);
  const backTo = BACK_TO[importerKey] || "/owner";

  // JADVALDAN TURIB YANGI GURUH YARATISH.
  //
  // Import qiladigan odam ko'pincha guruh HALI YO'Q paytda keladi
  // (yangi markaz, yangi o'quv yili). Ilgari u importni tashlab,
  // Guruhlar sahifasiga o'tib, guruh ochib, qaytib kelib, faylni
  // qaytadan yuklashi kerak edi.
  //
  // Forma bu yerda IN'EKTSIYA qilinadi: usta `shared/` da yashaydi va
  // owner panelidagi guruh formasini import qila olmaydi (qatlam
  // buzilardi). Ruxsat ham shu yerda tekshiriladi -
  // CreatableSelectField'dagi naqsh bilan bir xil.
  //
  // `valueOf` NOM qaytaradi, ID emas: import qatorlari Excel bilan bir
  // xil shaklda qoladi va server nom bo'yicha qidiradi.
  //
  // RUXSAT shu yerda BOOLEAN ga aylantiriladi: `has` har render'da yangi
  // funksiya, unga bog'langan useMemo har safar qayta hisoblanardi va
  // `creatable` havolasi o'zgarib, jadval qatorlarining memo'si
  // ishlamay qolardi.
  const canCreateGroup = has(PERMISSIONS.GROUPS_CREATE);
  const creatable = useMemo(
    () =>
      canCreateGroup
        ? {
            groups: {
              label: "Yangi guruh",
              title: "Yangi guruh",
              className: "max-w-2xl",
              modal: <GroupCreateModal />,
              valueOf: (g) => g?.name,
            },
          }
        : null,
    [canCreateGroup],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          onClick={() => navigate(backTo)}
          aria-label="Ortga"
          className="size-9 shrink-0"
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSpreadsheet className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              {importer?.label || "Import"} — Excel'dan yuklash
            </h1>
          </div>
        </div>
      </header>

      <ImportWizard
        importerKey={importerKey}
        creatable={creatable}
        close={() => navigate(backTo)}
      />
    </div>
  );
};

export default ImportPage;
