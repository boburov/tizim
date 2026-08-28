import PageShell from "@/shared/components/page/PageShell";
import RoomUtilizationSection from "../components/RoomUtilizationSection";

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
