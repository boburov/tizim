import PageShell from "@/shared/components/page/PageShell";
import { RoomUtilizationSection } from "@/owner/features/rooms";

const RoomAnalyticsPage = () => {
  return (
    <PageShell
      title="Xonalar tahlili"
    >
      <RoomUtilizationSection />
    </PageShell>
  );
};

export default RoomAnalyticsPage;
