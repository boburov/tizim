import PageShell from "@/shared/components/page/PageShell";
import RoomUtilizationSection from "../components/RoomUtilizationSection";

const RoomAnalyticsPage = () => {
  return (
    <PageShell
      title="Xonalar tahlili"
      subtitle="Filialdagi xonalar bandligi, bo'sh xonalar qidiruvi va haftalik yuklama"
    >
      <RoomUtilizationSection />
    </PageShell>
  );
};

export default RoomAnalyticsPage;
