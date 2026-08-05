// TanStack Query
import { useQuery } from "@tanstack/react-query";

// Hooks
import useDebounce from "@/shared/hooks/useDebounce";

// API
import { usersAPI } from "../api/users.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// TELEFON / LOGIN BANDLIGINI YOZAYOTGAN PAYTDA tekshiradi.
//
// Muammo: foydalanuvchi yaratish formasi ikki qadamli va takrorlanish faqat
// OXIRIDA - server 409 qaytarganda bilinardi. Odam ism, login, parol, sana
// va maoshni to'ldirib bo'lgach "bu telefon allaqachon ro'yxatdan o'tgan"
// xabarini olardi. Endi xato maydonning O'ZIDA, darhol ko'rinadi.
//
// Debounce: har bosilgan tugma uchun so'rov ketmasin. Telefon maskali
// (+998 (00) 000-00-00) bo'lgani uchun to'liq raqam ~9 ta bosishda yig'iladi.
const useAvailabilityQuery = ({ phone = "", username = "", excludeId } = {}) => {
  const debouncedPhone = useDebounce(phone);
  const debouncedUsername = useDebounce(username);

  // Faqat MA'NOLI qiymat so'raladi:
  //   telefon - to'liq (998 + 9 raqam) bo'lgandagina; yarim raqam har doim
  //             "band emas" qaytaradi va bu foydasiz so'rov;
  //   login   - serverdagi minimal uzunlikdan (3) boshlab.
  const digits = String(debouncedPhone || "").replace(/\D/g, "");
  const askPhone = digits.length === 12 ? debouncedPhone : "";
  const askUsername =
    debouncedUsername.trim().length >= 3 ? debouncedUsername.trim() : "";

  const params = {
    ...(askPhone ? { phone: askPhone } : {}),
    ...(askUsername ? { username: askUsername } : {}),
    ...(excludeId ? { excludeId } : {}),
  };

  const enabled = Boolean(askPhone || askUsername);

  const query = useQuery({
    queryKey: qk.users.availability(params),
    queryFn: () => usersAPI.checkAvailability(params).then((r) => r.data.data),
    enabled,
    // Band raqam bo'shab qolmaydi (o'chirilgan odamda ham band turaveradi),
    // shuning uchun javobni uzoq keshlash xavfsiz va bir xil raqam qayta
    // yozilganda so'rov ketmaydi.
    staleTime: 5 * 60 * 1000,
    // Bandlik tekshiruvi YO'LDOSH amal: yiqilsa formani to'sib qo'ymaydi
    // (server oxirida baribir tekshiradi), shuning uchun qayta urinmaymiz.
    retry: false,
  });

  return {
    // `undefined` - "hali noma'lum" (so'rov ketmagan yoki javob kelmagan).
    // Bu `false` dan FARQ QILADI: noma'lum holatda xato ko'rsatilmasligi
    // kerak, aks holda har yozilgan raqam bir zumda qizil bo'lib chiqardi.
    phoneTaken: query.data?.phone?.taken,
    usernameTaken: query.data?.username?.taken,
    isChecking: enabled && query.isFetching,
    // Yozilayotgan qiymat tekshirilgan qiymatdan orqada qolgan bo'lsa
    // (debounce kutmoqda) - natija hali BU qiymatga tegishli emas.
    isStale: phone !== debouncedPhone || username !== debouncedUsername,
  };
};

export default useAvailabilityQuery;
