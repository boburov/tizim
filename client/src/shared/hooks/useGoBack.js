import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Brauzer "orqaga" tugmasi kabi: ichki tarix bo'lsa -1, bo'lmasa fallback yo'nalishi
const useGoBack = (fallback = "/") => {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else navigate(fallback);
  }, [navigate, location.key, fallback]);
};

export default useGoBack;