import PageShell from "@/shared/components/page/PageShell";
import { RoomUtilizationSection } from "@/owner/features/rooms";

const RoomAnalyticsPage = () => {
  return (
    <PageShell
      title="Xonalar tahlili"
      subtitle="Tashkilot bo'yicha barcha xonalar bandligi va qidiruvi"
    >
      <RoomUtilizationSection />
    </PageShell>
  );
};

export default RoomAnalyticsPage;
