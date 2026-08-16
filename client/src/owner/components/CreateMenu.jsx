// Sidebar
import { useSidebar } from "@/shared/components/shadcn/sidebar";

// Components
import CreateSplitButton from "@/shared/components/create/CreateSplitButton";

/**
 * Sidebar tepasidagi global "Yaratish" tugmasi.
 *
 * MANTIQ VA RO'YXAT SHU YERDA EMAS - `shared/components/create/` da
 * (`createRegistry.js` + `CreateSplitButton.jsx`). Ilgari ro'yxat aynan
 * shu faylda edi, endi uni IKKI qobiq ishlatadi: operatsion sidebar va
 * rahbariyat sarlavhasi. Ikki nusxa vaqt o'tib ajralib ketardi.
 *
 * Bu komponent faqat SIDEBAR KONTEKSTINI qo'shadi: yig'ilgan holat va
 * mobilda modal ochilgach sidebar'ni yopish.
 */
const CreateMenu = () => {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;

  return (
    <CreateSplitButton
      variant="sidebar"
      collapsed={isCollapsed}
      // Mobilda sidebar modal ustida qolib ketmasin.
      onAfterOpen={() => isMobile && toggleSidebar()}
    />
  );
};

export default CreateMenu;
