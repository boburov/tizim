// Router
import { Outlet } from "react-router-dom";

// Components
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";

const BASE = "/owner/feedback";

// Feedback ro'yxati + hisoboti. Turlari (feedback-types) Sozlamalarga ko'chdi.
const FeedbackPage = () => {
  const items = [
    { to: BASE, label: "Ro'yxat", exact: true },
    { to: `${BASE}/hisobot`, label: "Hisobot" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Feedback</h1>
      <TabsLinks items={items} />
      <Outlet />
    </div>
  );
};

export default FeedbackPage;
