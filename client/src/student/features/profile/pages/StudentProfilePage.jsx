import { useState } from "react";

import {
  UserProfileCard,
  UserActiveGroupsList,
  UserTelegramCard,
  UserGroupHistoryTable,
} from "@/shared/components/userProfile";

import useMeQuery from "@/features/auth/hooks/useMeQuery";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

import Button from "@/shared/components/ui/button/Button";

const StudentProfilePage = () => {
  const { data, isLoading } = useMeQuery();
  const profile = data?.profile;
  const [showHistory, setShowHistory] = useState(false);

  // Tarix faqat tugma bosilganda yuklanadi
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: qk.users.groupHistory(profile?._id, { limit: 50 }),
    queryFn: () =>
      http
        .get(ENDPOINTS.users.groupHistory(profile._id), { params: { limit: 50 } })
        .then((r) => r.data),
    enabled: !!profile?._id && showHistory,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Profil ma'lumotlari topilmadi
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Mening profilim</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2 space-y-5">
          <UserProfileCard profile={profile} />
        </div>
        <div className="space-y-5">
          <UserTelegramCard telegram={profile.telegram} />
          <UserActiveGroupsList activeGroups={profile.activeGroups || []} />
        </div>
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Tarixni yashirish" : "Guruhlar tarixini ko'rish"}
        </Button>
      </div>

      {showHistory && (
        <UserGroupHistoryTable
          items={historyData?.data || []}
          isLoading={historyLoading}
        />
      )}
    </div>
  );
};

export default StudentProfilePage;
