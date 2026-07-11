// Router
import { Link } from "react-router-dom";

// Icons
import {
  Trash2,
  Send,
  KeyRound,
  MoreVertical,
  CalendarRange,
} from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/components/shadcn/dropdown-menu";

// Hooks
import useModal from "@/shared/hooks/useModal";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Utils
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatDateUzLong } from "@/shared/utils/formatDate";

const GroupStudentsTable = ({ group }) => {
  const { openModal } = useModal();

  const students = group?.students || [];

  if (students.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Guruhda hali o'quvchi yo'q
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-x-auto bg-white">
      <table className="w-full min-w-[820px] table-fixed text-sm">
        <colgroup>
          <col className="w-12" />
          <col className="w-[26%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
          <col className="w-[20%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400">
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Ism familiya</th>
            <th className="px-4 py-3">Telefon</th>
            <th className="px-4 py-3">Telegram</th>
            <th className="px-4 py-3">Qo'shilgan</th>
            <th className="px-4 py-3 text-right">Amallar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {students.map((s, i) => (
            <tr key={s._id} className="transition-colors hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-400">{i + 1}</td>
              <td className="px-4 py-3">
                <Link
                  to={`/owner/users/${s._id}`}
                  className="block truncate font-medium hover:underline"
                  title={`${s.firstName} ${s.lastName}`}
                >
                  {s.firstName} {s.lastName}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600">
                <span
                  className="block truncate"
                  title={formatPhone(s.phone) || "-"}
                >
                  {formatPhone(s.phone) || "-"}
                </span>
              </td>
              <td className="px-4 py-3">
                {s.telegram ? (
                  s.telegram.username ? (
                    <a
                      href={`https://t.me/${s.telegram.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-1 font-medium text-sky-600 hover:text-sky-700 hover:underline"
                      title={`@${s.telegram.username}`}
                    >
                      <Send className="size-3.5 shrink-0" />
                      <span className="truncate">@{s.telegram.username}</span>
                    </a>
                  ) : (
                    <span
                      className="flex min-w-0 items-center gap-1 font-medium text-emerald-600"
                      title={`Telegram ID: ${s.telegram.telegramId}`}
                    >
                      <Send className="size-3.5 shrink-0" />
                      <span className="truncate">Bog'langan</span>
                    </span>
                  )
                ) : (
                  <span className="text-gray-300">Bog'lanmagan</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {s.joinedAt ? formatDateUzLong(s.joinedAt) : "-"}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Login va parol"
                    aria-label="Login va parol"
                    className="size-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    onClick={() =>
                      openModal(MODAL.USER_PASSWORD, { user: s })
                    }
                  >
                    <KeyRound className="size-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Amallar"
                        aria-label="Amallar"
                        className="size-8 text-gray-500 hover:text-gray-700"
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[12rem]">
                      <DropdownMenuItem
                        onSelect={() =>
                          openModal(MODAL.GROUP_STUDENT_PERIODS, {
                            group,
                            student: s,
                          })
                        }
                      >
                        <CalendarRange className="size-4" />
                        O'qish davrlari
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-700"
                        onSelect={() =>
                          openModal(MODAL.GROUP_REMOVE_STUDENT, {
                            groupId: group._id,
                            student: s,
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                        Guruhdan chiqarish
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default GroupStudentsTable;
