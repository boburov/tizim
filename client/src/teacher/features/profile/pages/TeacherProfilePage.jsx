import {
  UserProfileCard,
  UserTaughtGroupsList,
  UserTelegramCard,
} from "@/shared/components/userProfile";

import useMeQuery from "@/features/auth/hooks/useMeQuery";

const TeacherProfilePage = () => {
  const { data, isLoading } = useMeQuery();
  const profile = data?.profile;

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
          <UserTaughtGroupsList groups={profile.groups || []} />
        </div>
      </div>
    </div>
  );
};

export default TeacherProfilePage;
