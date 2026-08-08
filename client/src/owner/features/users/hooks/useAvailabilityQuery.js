// TanStack Query
import { useQuery } from "@tanstack/react-query";

// Hooks
import useDebounce from "@/shared/hooks/useDebounce";

// API
import { usersAPI } from "../api/users.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// LOGIN (username) BANDLIGINI YOZAYOTGAN PAYTDA tekshiradi.
//
// Muammo: foydalanuvchi yaratish formasi ikki qadamli va takrorlanish faqat
// OXIRIDA - server 409 qaytarganda bilinardi. Odam ism, login, parol, sana
// va maoshni to'ldirib bo'lgach "bunday login mavjud" xabarini olardi.
// Endi xato maydonning O'ZIDA, darhol ko'rinadi.
//
// TELEFON TEKSHIRILMAYDI: bir raqamdan bir nechta odam foydalanishi mumkin
// (ona ikki farzandini yozdiradi) va server ham takrorlanishni bloklamaydi.
//
// Debounce: har bosilgan tugma uchun so'rov ketmasin.
const useAvailabilityQuery = ({ username = "", excludeId } = {}) => {
  const debouncedUsername = useDebounce(username);

  // Faqat MA'NOLI qiymat so'raladi: serverdagi minimal uzunlikdan (3) boshlab.
  const askUsername =
    debouncedUsername.trim().length >= 3 ? debouncedUsername.trim() : "";

  const params = {
    ...(askUsername ? { username: askUsername } : {}),
    ...(excludeId ? { excludeId } : {}),
  };

  const enabled = Boolean(askUsername);

  const query = useQuery({
    queryKey: qk.users.availability(params),
    queryFn: () => usersAPI.checkAvailability(params).then((r) => r.data.data),
    enabled,
    // Band login bo'shab qolmaydi (o'chirilgan odamda ham band turaveradi),
    // shuning uchun javobni uzoq keshlash xavfsiz va bir xil login qayta
    // yozilganda so'rov ketmaydi.
    staleTime: 5 * 60 * 1000,
    // Bandlik tekshiruvi YO'LDOSH amal: yiqilsa formani to'sib qo'ymaydi
    // (server oxirida baribir tekshiradi), shuning uchun qayta urinmaymiz.
    retry: false,
  });

  return {
    // `undefined` - "hali noma'lum" (so'rov ketmagan yoki javob kelmagan).
    // Bu `false` dan FARQ QILADI: noma'lum holatda xato ko'rsatilmasligi
    // kerak, aks holda har yozilgan belgi bir zumda qizil bo'lib chiqardi.
    usernameTaken: query.data?.username?.taken,
    isChecking: enabled && query.isFetching,
    // Yozilayotgan qiymat tekshirilgan qiymatdan orqada qolgan bo'lsa
    // (debounce kutmoqda) - natija hali BU qiymatga tegishli emas.
    isStale: username !== debouncedUsername,
  };
};

export default useAvailabilityQuery;
