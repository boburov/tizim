// Router
import { useLocation } from "react-router-dom";

const usePathSegments = () => {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean) || [];

  return { pathSegments, location };
};

export default usePathSegments;
