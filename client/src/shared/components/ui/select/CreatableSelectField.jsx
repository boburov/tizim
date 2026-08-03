// React
import { cloneElement, useMemo, useState } from "react";

// Components
import SelectField from "./SelectField";
import QuickCreateModal from "../modal/QuickCreateModal";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";

// SelectField + "Yangi qo'shish" + tez qo'shish oynasi.
//
// Muammo: dinamik selectlarning ro'yxati boshqa sahifada boshqariladi
// (manba/yo'nalish - Sozlamalar > Lidlar, arxiv sababi - Sozlamalar > Arxiv
// sabablari, ...). Kerakli qiymat ro'yxatda bo'lmasa foydalanuvchi
// to'ldirayotgan formani tashlab, sozlamalarga o'tib, qaytib kelishga majbur
// edi. Endi ro'yxatning o'zidan qo'shadi va yangi yozuv DARHOL tanlanadi.
//
// `create` - MAVJUD "...CreateModal" komponentining elementi. Uni qayta
// yozmaymiz: QuickCreateModal ModalWrapper bilan bir xil kontrakt
// (`isLoading`/`setIsLoading`/`close`) uzatadi, biz esa ustiga `onCreated`
// qo'shamiz.
//
// `createPermission` - ruxsat kaliti. Ruxsat bo'lmasa qo'shish imkoni UMUMAN
// chiqmaydi (select o'zi o'qish uchun ochiq qolaveradi). Ega (owner) hamma
// tekshiruvdan o'tadi - usePermissions'dagi qoida.
//
// Yaratilgan yozuvdan variant yasaydi. Yagona shakl yo'q: lug'atlarda `name`
// yoki `title`, foydalanuvchida esa ism-familiya. `optionOf` bilan bekor
// qilish mumkin.
const defaultOptionOf = (e) => ({
  value: e?._id,
  label:
    e?.name ||
    e?.title ||
    `${e?.firstName || ""} ${e?.lastName || ""}`.trim() ||
    "-",
});

const CreatableSelectField = ({
  create,
  onCreated,
  optionOf = defaultOptionOf,
  createTitle = "",
  createLabel = "Yangi qo'shish",
  createPermission = "",
  createClassName = "",
  options = [],
  ...selectProps
}) => {
  const [open, setOpen] = useState(false);
  // Yaratilgan yozuv so'rov ro'yxatiga TUSHGUNCHA (invalidate -> refetch)
  // selectda ko'rinmasdi: qiymat o'rnatilgan, mos variant esa yo'q, ya'ni
  // trigger bir necha yuz millisekund placeholder ko'rsatib turardi. Shu
  // oraliqni to'ldirish uchun yaratilganlarni vaqtincha o'zimiz saqlaymiz.
  const [created, setCreated] = useState([]);
  const { has } = usePermissions();

  const canCreate = !!create && (!createPermission || has(createPermission));

  // Refetch kelgach yozuv `options` ichida paydo bo'ladi - takrorlanmasligi
  // uchun faqat yo'qlarini qo'shamiz. Oxiriga: ro'yxat boshida ko'pincha
  // "-" / "Barchasi" kabi maxsus variant turadi.
  const mergedOptions = useMemo(() => {
    if (!created.length) return options;
    const existing = new Set(options.map((o) => String(o.value)));
    const extra = created.filter((o) => !existing.has(String(o.value)));
    return extra.length ? [...options, ...extra] : options;
  }, [options, created]);

  const handleCreated = (entity) => {
    const option = optionOf(entity);
    if (option?.value) setCreated((prev) => [...prev, option]);
    onCreated?.(entity);
  };

  return (
    <>
      <SelectField
        {...selectProps}
        options={mergedOptions}
        addNewLabel={createLabel}
        onAddNew={canCreate ? () => setOpen(true) : undefined}
      />

      {/* Yopiq holatda Dialog DOM'ga hech narsa chiqarmaydi, shuning uchun
          bu qo'shni element grid/flex tartibini buzmaydi. */}
      {canCreate && (
        <QuickCreateModal
          open={open}
          onOpenChange={setOpen}
          title={createTitle || createLabel}
          className={createClassName}
        >
          {cloneElement(create, { onCreated: handleCreated })}
        </QuickCreateModal>
      )}
    </>
  );
};

export default CreatableSelectField;
