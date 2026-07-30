import AiDomainPanel from "@/shared/components/ai/AiDomainPanel";
import usePermissions from "@/shared/hooks/usePermissions";
import { useDomainInsightsQuery } from "../hooks/useDomainInsightsQuery";

// ULANGAN MODUL PANELI - modul sahifalari FAQAT shuni import qiladi.
//
// Ajratish sababi: shared/AiDomainPanel "ahmoq" (faqat chizadi), bu
// komponent esa ma'lumot oladi. Shared qatlamiga so'rov joylash uni
// owner feature'iga bog'lab qo'yardi va FSD qoidasini buzardi.
//
// RUXSAT TEKSHIRUVI SHU YERDA: ai.read yo'q foydalanuvchiga panel
// ko'rinmasligi kerak va so'rov ham YUBORILMASLIGI kerak (aks holda
// har bir modul sahifasi 403 qaytaradigan keraksiz so'rov qilardi).

const AiDomainInsights = ({ domain, title, limit = 4, className = "" }) => {
  const { has } = usePermissions();
  const allowed = has("ai.read");

  const { data, isLoading } = useDomainInsightsQuery(
    domain,
    { limit },
    { enabled: allowed },
  );

  if (!allowed) return null;

  return (
    <AiDomainPanel
      data={data}
      isLoading={isLoading}
      title={title}
      className={className}
    />
  );
};

export default AiDomainInsights;
