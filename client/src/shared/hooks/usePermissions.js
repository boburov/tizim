// Hooks
import useAuth from "@/shared/hooks/useAuth";

const usePermissions = () => {
  const { permissions, isOwner } = useAuth();

  const has = (key) => {
    if (isOwner) return true;
    if (!key) return false;
    return permissions.includes(key);
  };

  const hasAny = (keys = []) => keys.some(has);
  const hasAll = (keys = []) => keys.every(has);

  return { permissions, has, hasAny, hasAll };
};

export default usePermissions;
