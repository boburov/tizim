// React
import { cloneElement, useState } from "react";

// Utils
import { cn } from "@/shared/utils/cn";

// Ui components
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogDescription,
} from "@/shared/components/shadcn/dialog";

// LOKAL boshqariladigan modal. ModalWrapper'dan ikki farqi bor va ikkalasi
// ham ataylab:
//
// 1) REDUX'GA TEGMAYDI. Bu oyna deyarli doim BOSHQA modal ichidan ochiladi
//    ("Lid qo'shish" formasidagi "+ Yangi manba"). Redux registrida modal
//    nomi GLOBAL kalit - bitta ModalWrapper ikki joyda render bo'lsa, kalit
//    ochilganda ikkala nusxa ham ochilardi. Bu yerda holat komponent ichida,
//    shuning uchun bir sahifada nechta bo'lsa ham bir-biriga xalaqit bermaydi.
//
// 2) MOBILDA HAM Dialog (Drawer emas). Ota modal mobilda vaul Drawer bo'ladi,
//    vaul esa ichma-ich drawer uchun `NestedRoot` talab qiladi - oddiy
//    Drawer ichida Drawer ochilsa ota drawer siljib/yopilib ketadi. Radix
//    Dialog body'ga portal qilinadi va DOM tartibida keyin turgani uchun
//    ustida ko'rinadi, qo'shimcha z-index shart emas.
//
// Bola komponentga ModalWrapper bilan BIR XIL kontrakt uzatiladi
// (`isLoading`, `setIsLoading`, `close`), shuning uchun mavjud "...CreateModal"
// komponentlari o'zgarishsiz shu yerda ham ishlayveradi.
const QuickCreateModal = ({
  open = false,
  onOpenChange,
  title = "Yangi",
  description = "",
  className = "",
  children,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  // TASHQI yopish (fon bosildi / Esc): so'rov ketayotgan bo'lsa yopilmasin.
  // Bu yerda `isLoading` state'ining o'zini o'qish yetarli - foydalanuvchi
  // harakati doim navbatdagi renderdan KEYIN keladi, demak qiymat yangi.
  const handleOpenChange = (next) => {
    if (!next && isLoading) return;
    if (!next) setIsLoading(false);
    onOpenChange?.(next);
  };

  // BOLA yopganda (Bekor qilish tugmasi yoki muvaffaqiyatli yaratilgach)
  // guard qo'llanmaydi. Sabab: bola `setIsLoading(false)` dan keyin darhol
  // `close()` chaqiradi va o'sha renderdagi `isLoading` hali `true` - guard
  // bo'lsa oyna ochiq qolib ketardi. ModalWrapper buni ref bilan hal qiladi;
  // bu yerda ref kerak emas, chunki har bir create modalning "Bekor qilish"
  // tugmasi allaqachon `disabled={isLoading}`.
  const closeNow = () => {
    setIsLoading(false);
    onOpenChange?.(false);
  };

  const body = cloneElement(children, {
    isLoading,
    setIsLoading,
    close: closeNow,
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* `w-[calc(100%-1.5rem)]` - DialogContent default'i `w-full`, ya'ni
          telefonda chetdan chetga yopishib qolardi (ModalWrapper u yerda
          Drawer ishlatgani uchun bu holat hech qachon ko'rinmagan).
          `max-w-*` ni chaqiruvchi `className` bilan almashtirsa bo'ladi -
          cn() tailwind-merge orqali oxirgisini qoldiradi. */}
      <DialogContent
        className={cn("w-[calc(100%-1.5rem)] max-w-md", className)}
      >
        {/* Header */}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Body */}
        {/* ICHKI FORMA OTA FORMANI YUBORMASLIGI KERAK.
            Radix DialogContent body'ga PORTAL qilinadi, ya'ni DOM'da ichma-ich
            <form> yo'q. Lekin React hodisalari DOM daraxti emas, REACT daraxti
            bo'ylab ko'tariladi. Bu oyna deyarli doim boshqa formaning ICHIDAGI
            selectdan ochiladi ("Lid qo'shish" > "+ Yangi manba"), shuning uchun
            bu yerdagi inputda Enter bosilganda ichki forma submit bo'lardi va
            o'sha hodisa OTA formaning `onSubmit` iga yetib borib, lidni
            so'ramasdan yaratib yuborardi. `preventDefault` yordam bermaydi -
            u faqat brauzer amalini to'xtatadi, tarqalishni emas.
            `contents` - div layoutda o'z qutisini yaratmasin (DialogContent
            grid, bola forma to'g'ridan-to'g'ri element bo'lib qolaveradi). */}
        <div className="contents" onSubmit={(e) => e.stopPropagation()}>
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickCreateModal;
