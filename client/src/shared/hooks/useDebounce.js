// State
import { useEffect, useState } from "react";

// Qiymatni `delay` ms kechiktirib qaytaradi.
// Qidiruv inputlarida ishlatamiz: foydalanuvchi yozishni to'xtatgach
// (delay ms jim turgach) bitta so'rov yuboriladi - har harfda emas.
//
// const debounced = useDebounce(search);
// useUsersListQuery({ search: debounced });
const useDebounce = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
};

export default useDebounce;
