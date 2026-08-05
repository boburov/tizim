// Icons
import {
  Archive,
  Building2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
} from "lucide-react";

// Router
import { Link, useNavigate } from "react-router-dom";

// Components
import Badge from "@/shared/components/ui/badge/Badge";
import Button from "@/shared/components/ui/button/Button";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useActiveBranch from "@/shared/hooks/useActiveBranch";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { ROLES, ROLE_TYPES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { formatPhone } from "@/shared/utils/formatPhone";
import { formatDateUzLong } from "@/shared/utils/formatDate";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
const dash = <span className="text-muted-foreground/50">-</span>;

// Saralanadigan ustun sarlavhasi.
const SortHead = ({ field, sort, order, onSort, children }) => (
  <button
    type="button"
    onClick={() => onSort(field)}
    className="inline-flex items-center gap-1 hover:text-primary"
  >
    {children}
    {sort === field &&
      (order === "asc" ? (
        <ChevronUp className="size-3.5" />
      ) : (
        <ChevronDown className="size-3.5" />
      ))}
  </button>
);

/**
 * XODIMLAR jadvali.
 *
 * UsersTable'dan ATAYLAB ajratilgan: u o'quvchi/o'qituvchi uchun qurilgan
 * (guruh ustuni, muzlatish tugmalari, "Ro'yxatga olingan" sanasi) va rol
 * nishonini ROLE_LABELS'dan oladi - custom rol (direktor, buxgalter) u
 * yerda YO'Q va qizil "xato" nishoni bo'lib chiqardi. Bu yerda yorliq
 * serverdan keladi (roleLabel).
 *
 * AMALLAR ruxsat bo'yicha OLDINDAN yopiladi, 403 orqali "kashf qilinmaydi":
 * parol/arxiv/o'chirish endpointlari requireRole(owner) bilan himoyalangan,
 * shuning uchun ular faqat egaga ko'rinadi. Owner qatorining o'zi esa
 * to'liq qulflangan - server ham uni tahrirlashni rad etadi.
 */
const StaffTable = ({
  rows = [],
  isLoading = false,
  status = "active",
  startIndex = 0,
  sort,
  order,
  onSort,
}) => {
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { user: me, isOwner } = useAuth();
  const { hasMultipleBranches } = useActiveBranch();

  const canManageRole = has(PERMISSIONS.ROLES_UPDATE);
  const showBranch = hasMultipleBranches;

  const openDetail = (u) => navigate(`/owner/users/${u._id}`);

  const nameCell = (u) => (
    <div className="min-w-0">
      <Link
        to={`/owner/users/${u._id}`}
        className="font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {u.firstName} {u.lastName}
      </Link>
      <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
    </div>
  );

  const roleCell = (u) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" className="font-medium">
        {u.roleLabel || u.role}
      </Badge>
      {u.roleIsFrozen && (
        <Badge className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
          Rol muzlatilgan
        </Badge>
      )}
      {status === "all" && !u.isActive && (
        <Badge className="bg-accent text-foreground">Arxiv</Badge>
      )}
    </div>
  );

  // FAOLLIK. lastLoginAt - aniq kirish payti (doimiy saqlanadi),
  // activeSessions - hozir tirik sessiya (refresh token).
  const activityCell = (u) => {
    if (u.activeSessions > 0) {
      return (
        <StatusBadge tone="success" icon={ShieldCheck}>
          Tizimda
        </StatusBadge>
      );
    }
    if (u.lastLoginAt) {
      return (
        <span className="text-muted-foreground">
          {formatDateUzLong(u.lastLoginAt)}
        </span>
      );
    }
    return <StatusBadge tone="neutral">Kirmagan</StatusBadge>;
  };

  const actionsCell = (u) => {
    const isOwnerRow =
      u.role === ROLES.OWNER || u.roleType === ROLE_TYPES.OWNER;
    const isSelf = String(u._id) === String(me?._id);
    const archived = !u.isActive;

    // Owner qatori: server update/parol/arxiv/o'chirishning HAMMASINI 403
    // qiladi, shuning uchun tugmalar umuman ko'rsatilmaydi.
    if (isOwnerRow) {
      return <span className="text-muted-foreground">-</span>;
    }

    return (
      <div
        className="flex items-center justify-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {!archived && canManageRole && !isSelf && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openModal(MODAL.STAFF_ROLE, { user: u })}
            aria-label="Rolni o'zgartirish"
            title="Rolni o'zgartirish"
          >
            <UserCog className="size-4" />
          </Button>
        )}
        {!archived && showBranch && canManageRole && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openModal(MODAL.USER_BRANCH, { user: u })}
            aria-label="Filial biriktiruvi"
            title="Filial"
          >
            <Building2 className="size-4" />
          </Button>
        )}
        {!archived && isOwner && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openModal(MODAL.USER_PASSWORD, { user: u })}
            aria-label="Parolni ko'rish"
            title="Parol"
          >
            <KeyRound className="size-4" />
          </Button>
        )}
        {isOwner &&
          (archived ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-500/10 hover:text-green-700 dark:hover:text-green-300"
              onClick={() => openModal(MODAL.USER_RESTORE, { user: u })}
              aria-label="Tiklash"
              title="Tiklash"
            >
              <RotateCcw className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300"
              onClick={() => openModal(MODAL.USER_DELETE, { user: u })}
              aria-label="Arxivlash"
              title="Arxivlash"
            >
              <Archive className="size-4" />
            </Button>
          ))}
        {isOwner && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
            onClick={() => openModal(MODAL.USER_PERMANENT_DELETE, { user: u })}
            aria-label="Butunlay o'chirish"
            title="Butunlay o'chirish"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    );
  };

  const columns = [
    {
      key: "index",
      header: "#",
      headerClassName: th,
      className: "text-muted-foreground",
      cell: (_u, i) => startIndex + i + 1,
    },
    {
      key: "name",
      header: (
        <SortHead field="firstName" sort={sort} order={order} onSort={onSort}>
          Ism familiya
        </SortHead>
      ),
      headerClassName: th,
      cell: nameCell,
    },
    {
      key: "phone",
      header: "Telefon",
      headerClassName: th,
      cell: (u) => formatPhone(u.phone) || dash,
    },
    { key: "role", header: "Rol", headerClassName: th, cell: roleCell },
    ...(showBranch
      ? [
          {
            key: "branch",
            header: "Filial",
            headerClassName: th,
            cell: (u) =>
              u.homeBranchId?.name ? (
                <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                  {u.homeBranchId.name}
                </span>
              ) : (
                dash
              ),
          },
        ]
      : []),
    {
      key: "activity",
      header: "Faollik",
      headerClassName: th,
      cell: activityCell,
    },
    {
      key: "joined",
      header: (
        <SortHead field="createdAt" sort={sort} order={order} onSort={onSort}>
          Qo'shilgan
        </SortHead>
      ),
      headerClassName: th,
      className: "text-muted-foreground",
      cell: (u) =>
        u.hiredAt || u.createdAt
          ? formatDateUzLong(u.hiredAt || u.createdAt)
          : dash,
    },
    {
      key: "actions",
      header: "Amallar",
      headerClassName: `${th} text-right`,
      className: "text-right",
      cell: actionsCell,
    },
  ];

  const renderCard = (u) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        {nameCell(u)}
        {actionsCell(u)}
      </div>
      {roleCell(u)}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{formatPhone(u.phone) || "Telefon yo'q"}</span>
        {showBranch && u.homeBranchId?.name && (
          <span>· {u.homeBranchId.name}</span>
        )}
      </div>
      {activityCell(u)}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      rowKey={(u) => u._id}
      onRowClick={openDetail}
      renderCard={renderCard}
      empty={
        <EmptyState
          icon={UsersRound}
          title="Xodim topilmadi"
          description={
            status === "archived"
              ? "Arxivda xodim yo'q."
              : "Tanlangan filtrlar bo'yicha xodim yo'q. Yangi xodim qo'shing."
          }
        />
      }
    />
  );
};

export default StaffTable;
