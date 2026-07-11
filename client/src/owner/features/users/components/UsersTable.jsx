// Icons
import { KeyRound, Archive, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";

// Router
import { Link, useNavigate } from "react-router-dom";

// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import useModal from "@/shared/hooks/useModal";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";

// Helpers
import { getRoleLabel, hasValidRole } from "@/shared/helpers/role.helpers";

// Components
import Badge from "@/shared/components/ui/badge/Badge";

// Utils
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatDateUzLong } from "@/shared/utils/formatDate";
import { formatEnrolledDuration } from "@/shared/utils/enrollmentDuration";

// Guruh ustunida ko'rsatiladigan maksimal chip soni - qolgani "+N" bo'lib chiqadi
const MAX_GROUP_CHIPS = 3;

// Bosiluvchi (saralanadigan) ustun sarlavhasi
const SortableTh = ({ field, sort, order, onSort, children, className = "" }) => {
  const active = sort === field;
  return (
    <th className={"px-4 py-2 font-medium " + className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-primary"
      >
        {children}
        {active &&
          (order === "asc" ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          ))}
      </button>
    </th>
  );
};

const UsersTable = ({
  users = [],
  archived = false,
  role,
  sort,
  order,
  onSort,
}) => {
  const { openModal } = useModal();
  const navigate = useNavigate();

  // Faqat o'quvchilar ro'yxatida Guruh ustuni ko'rsatiladi
  const isStudent = role === ROLES.STUDENT;
  const canSort = typeof onSort === "function";

  // O'quvchi uchun "Kelgan", o'qituvchi uchun "Ish boshlagan"
  const joinedLabel = isStudent ? "Ro'yxatga olingan" : "Ish boshlagan";
  // Arxiv ro'yxatida boshlangan/arxivlangan sanalar bir ustunda ko'rsatiladi
  const joinedColLabel = archived ? "Boshlagan / Arxivlangan" : joinedLabel;

  if (users.length === 0) {
    return (
      <div className="border rounded-lg p-10 text-center bg-white">
        <p className="text-muted-foreground">
          {archived
            ? "Arxivda foydalanuvchi yo'q"
            : "Foydalanuvchi topilmadi"}
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-sm overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead className=" text-left">
          <tr>
            <th className="px-4 py-2 font-medium">#</th>
            {canSort ? (
              <SortableTh
                field="firstName"
                sort={sort}
                order={order}
                onSort={onSort}
              >
                Ism familiya
              </SortableTh>
            ) : (
              <th className="px-4 py-2 font-medium">Ism familiya</th>
            )}
            <th className="px-4 py-2 font-medium">Telefon</th>
            <th className="px-4 py-2 font-medium">Rol</th>
            {isStudent && <th className="px-4 py-2 font-medium">Guruh</th>}
            <th className="px-4 py-2 font-medium">{joinedColLabel}</th>
            <th className="px-4 py-2 font-medium text-right">Amallar</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr
              key={u._id}
              onClick={() => navigate(`/owner/users/${u._id}`)}
              className="border-t cursor-pointer transition-colors hover:bg-gray-50"
            >
              <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
              <td className="px-4 py-2">
                <Link
                  to={`/owner/users/${u._id}`}
                  className="font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {u.firstName} {u.lastName}
                </Link>
              </td>
              <td className="px-4 py-2">{formatPhone(u.phone) || "-"}</td>
              <td className="px-4 py-2">
                <Badge
                  variant={hasValidRole(u.role) ? "secondary" : "destructive"}
                  className="font-medium"
                >
                  {getRoleLabel(u.role)}
                </Badge>
              </td>
              {isStudent && (
                <td className="px-4 py-2">
                  {u.activeGroups?.length ? (
                    (() => {
                      const shown = u.activeGroups.slice(0, MAX_GROUP_CHIPS);
                      const rest = u.activeGroups.slice(MAX_GROUP_CHIPS);
                      return (
                        <div className="flex flex-wrap gap-1">
                          {shown.map((g) => (
                            <span
                              key={g._id}
                              className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                            >
                              {g.name}
                            </span>
                          ))}
                          {rest.length > 0 && (
                            <span
                              className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500"
                              title={rest.map((g) => g.name).join(", ")}
                            >
                              +{rest.length}
                            </span>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
              )}
              <td className="px-4 py-2 text-muted-foreground">
                {(() => {
                  // Boshlangan sana: o'quvchi → enrolledAt, o'qituvchi → hiredAt.
                  const start = (isStudent ? u.enrolledAt : u.hiredAt) || u.createdAt;
                  if (archived) {
                    return (
                      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 items-center">
                        <span className="text-xs uppercase tracking-wide text-zinc-400">
                          Boshlagan
                        </span>
                        <span>{start ? formatDateUzLong(start) : "-"}</span>
                        {isStudent && (
                          <>
                            <span className="text-xs uppercase tracking-wide text-zinc-400">
                              Yakunlangan
                            </span>
                            <span>
                              {u.completedAt ? formatDateUzLong(u.completedAt) : "-"}
                            </span>
                          </>
                        )}
                        <span className="text-xs uppercase tracking-wide text-zinc-400">
                          Arxivlangan
                        </span>
                        <span>
                          {u.archivedAt ? formatDateUzLong(u.archivedAt) : "-"}
                        </span>
                      </div>
                    );
                  }
                  if (isStudent) {
                    return start ? (
                      <div className="leading-tight">
                        <div>{formatDateUzLong(start)}</div>
                        <div className="text-xs text-zinc-400">
                          {formatEnrolledDuration(u.enrolledAt, u.completedAt)}
                        </div>
                      </div>
                    ) : (
                      "-"
                    );
                  }
                  return start ? formatDateUzLong(start) : "-";
                })()}
              </td>
              <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {archived ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-green-600 hover:bg-green-50 hover:text-green-700"
                      onClick={() => openModal(MODAL.USER_RESTORE, { user: u })}
                      aria-label="Tiklash"
                      title="Tiklash"
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openModal(MODAL.USER_PASSWORD, { user: u })
                        }
                        
                        aria-label="Parolni ko'rish"
                        title="Parol"
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                        onClick={() => openModal(MODAL.USER_DELETE, { user: u })}
                        aria-label="Foydalanuvchini arxivlash"
                        title="Arxivlash"
                      >
                        <Archive className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UsersTable;
