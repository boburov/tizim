// Utils
import { cn } from "@/shared/utils/cn";

// React mask
import { IMaskInput } from "react-imask";

// Components
import { inputBaseClasses } from "./Input";

/**
 * Pul miqdori uchun input.
 * Ko'rinishda mingliklar probel bilan ajraladi (60000 -> "60 000"),
 * lekin onChange orqali tashqariga xom raqamli string (masalan "60000") beriladi.
 * Shu sababli mavjud submit logikasi (Number(value)) o'zgartirilmasdan ishlaydi.
 */
const InputMoney = ({ className = "", onChange, name, value, ...props }) => {
  const handleAccept = (_, mask) => {
    if (!onChange) return;
    // mask.unmaskedValue - probelsiz xom raqam ("60000")
    onChange({ target: { name, value: mask.unmaskedValue } });
  };

  return (
    <IMaskInput
      type="text"
      inputMode="numeric"
      name={name}
      // value String bo'lishi kerak, aks holda IMask ogohlantiradi
      value={value == null ? "" : String(value)}
      onAccept={handleAccept}
      mask={Number}
      scale={0}
      thousandsSeparator=" "
      // foydalanuvchi to'g'ridan-to'g'ri xom qiymat berib yuborsa ham mos kelsin
      unmask={true}
      className={cn(className, inputBaseClasses)}
      {...props}
    />
  );
};

export default InputMoney;
