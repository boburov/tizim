import { useState } from "react";

// Utils
import { cn } from "@/shared/utils/cn";

// Constants
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";

/**
 * Brend belgisi: logotip, u yuklanmasa - nom bosh harfidan monogram.
 *
 * NEGA fallback kerak: logo manzili .env dan keladi (VITE_APP_LOGO) va
 * deploy'da fayl ko'chirilmasa 404 qaytadi. Bunday holatda brauzer
 * "broken image" kvadratini chizadi - aynan login va Telegram mini ilova
 * ekranlarida, ya'ni foydalanuvchi ko'radigan birinchi joyda.
 *
 * Nom har doim `.env` dagi VITE_APP_NAME dan olinadi (server tomonda ayni
 * shu qiymat APP_NAME'da turadi), shuning uchun brendni bir joyda
 * o'zgartirish yetarli.
 */
const BrandMark = ({ className }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "size-14 rounded-xl bg-primary/10 text-primary",
          "flex items-center justify-center text-xl font-semibold",
          className,
        )}
      >
        {APP_NAME.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      width={56}
      height={56}
      src={APP_LOGO}
      alt={`${APP_NAME} logotipi`}
      onError={() => setFailed(true)}
      className={cn("size-14 rounded-xl object-cover", className)}
    />
  );
};

export default BrandMark;
