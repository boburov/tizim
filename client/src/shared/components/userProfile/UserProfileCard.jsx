import Card from "@/shared/components/ui/card/Card";
import Badge from "@/shared/components/ui/badge/Badge";
import {
  AtSign,
  Phone,
  Cake,
  User,
  CalendarPlus,
  CalendarCheck,
  Clock,
  Briefcase,
} from "lucide-react";
import { ROLES } from "@/shared/constants/roles";
import { getRoleLabel, hasValidRole } from "@/shared/helpers/role.helpers";
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatDateUz } from "@/shared/utils/formatDate";
import { formatEnrolledDuration } from "@/shared/utils/enrollmentDuration";
import { calculateAge } from "@/shared/utils/calculateAge";

const GENDER_LABEL = { male: "Erkak", female: "Ayol" };

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
      <Icon className="size-4" />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground/90 break-words">
        {value || "-"}
      </p>
    </div>
  </div>
);

const UserProfileCard = ({ profile }) => {
  if (!profile) return null;

  const initial =
    (profile.firstName?.[0] || profile.username?.[0] || "?").toUpperCase();
  const isStudent = profile.role === ROLES.STUDENT;
  const isTeacher = profile.role === ROLES.TEACHER;

  const age = profile.age ?? calculateAge(profile.birthDate);

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold uppercase text-primary ring-1 ring-primary/10">
          {initial}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">
            {profile.firstName} {profile.lastName}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge
              variant={hasValidRole(profile.role) ? "secondary" : "destructive"}
              className="rounded-full font-medium"
            >
              {getRoleLabel(profile.role)}
            </Badge>
            {profile.isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-600">
                <span className="size-1.5 rounded-full bg-green-500" />
                Faol
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                Nofaol
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t pt-6 sm:grid-cols-2">
        <InfoRow icon={AtSign} label="Login" value={`@${profile.username}`} />
        <InfoRow icon={Phone} label="Telefon" value={formatPhone(profile.phone)} />
        {!isStudent && (
          <InfoRow
            icon={Cake}
            label="Tug'ilgan sana"
            value={
              profile.birthDate
                ? `${formatDateUz(profile.birthDate)}${age != null ? ` (${age} yosh)` : ""}`
                : null
            }
          />
        )}
        {isStudent && (
          <InfoRow icon={User} label="Jinsi" value={GENDER_LABEL[profile.gender]} />
        )}

        {isStudent && (
          <>
            <InfoRow
              icon={CalendarPlus}
              label="Ro'yxatga olingan"
              value={formatDateUz(profile.enrolledAt)}
            />
            {profile.enrolledAt && (
              <InfoRow
                icon={Clock}
                label={profile.completedAt ? "O'qigan muddati" : "O'qiyapti"}
                value={
                  profile.completedAt
                    ? formatEnrolledDuration(
                        profile.enrolledAt,
                        profile.completedAt,
                      )
                    : `${formatEnrolledDuration(profile.enrolledAt)} oldin qo'shilgan`
                }
              />
            )}
            {profile.completedAt && (
              <InfoRow
                icon={CalendarCheck}
                label="Yakunlagan"
                value={formatDateUz(profile.completedAt)}
              />
            )}
          </>
        )}

        {isTeacher && (
          <InfoRow
            icon={Briefcase}
            label="Ishga olingan"
            value={
              profile.hiredAt
                ? `${formatDateUz(profile.hiredAt)}${
                    profile.years != null ? ` (${profile.years} yil staj)` : ""
                  }`
                : null
            }
          />
        )}
      </div>
    </Card>
  );
};

export default UserProfileCard;
