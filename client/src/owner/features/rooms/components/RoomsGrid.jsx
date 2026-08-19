import { Plus, Trash2, DoorOpen, Users, BookOpen } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";
import Button from "@/shared/components/ui/button/Button";
import EmptyState from "@/shared/components/page/EmptyState";

import { useRoomsQuery, useRoomRemoveMutation } from "@/owner/features/catalog/hooks/useCatalogQueries";

/**
 * ══════════════════════════════════════════════════════════════════════
 * XONALAR KARTA TO'RI — IKKI PANELDA BIR XIL (talab 10, 11, 32)
 * ══════════════════════════════════════════════════════════════════════
 *
 * BITTA komponent, ikki joyda:
 *   Super Admin → Filiallar → Filial A → Xonalar   (`branchId` beriladi)
 *   Admin       → Xonalar                           (`branchId` YO'Q)
 *
 * ── NEGA `branchId` IXTIYORIY ──
 * Super Admin filial ICHIDA turadi, ya'ni qaysi filial ekani aniq va u
 * uzatiladi. Administrator esa o'z filialida turadi va uni tanlamaydi:
 * server ro'yxatni ko'lam bo'yicha kesadi, yozishda esa filialni O'ZI
 * qo'yadi (`resolveBranchForWrite`). Shuning uchun bu yerda "filial
 * tanlash" degan tushuncha UMUMAN yo'q — u xato filialga xona qo'shish
 * yo'lini ochardi.
 *
 * ── NEGA JADVAL EMAS, KARTA ──
 * Xona — FIZIK narsa. Jadval qatori "yozuv" bo'lib o'qiladi, karta esa
 * xonaning o'zi bo'lib. Muhimi: karta to'rida "+" kartasi oxirgi element
 * bo'lib turadi va "yana bitta xona qo'shsam bo'ladi" degani ko'rinib
 * turadi — jadvalda bu tugma sarlavhaga chiqib ketardi.
 *
 * ── NEGA 4:3 ──
 * Bir xil nisbat — bir xil ritm. Kontent balandligiga qarab o'sadigan
 * kartalarda to'r "tishli" bo'lib ko'rinadi va ko'z tartibni yo'qotadi.
 */

const RoomCard = ({ room, canDelete, onDelete, deleting }) => (
  <div
    className={cn(
      "group relative flex aspect-[4/3] flex-col justify-between rounded-xl border border-border bg-card p-4 transition",
      "hover:border-foreground/20",
      room.isActive === false && "opacity-60",
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <DoorOpen className="size-4" strokeWidth={1.75} />
      </span>

      {canDelete && (
        <button
          type="button"
          aria-label={`${room.name} xonasini o'chirish`}
          disabled={deleting}
          onClick={() => onDelete(room)}
          className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>

    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{room.name}</p>

      {/* IKKITA RAQAM, YIGIRMATA EMAS (talab 8). Sig'im — xonaning
          o'zi haqida, guruh soni — undan qanday foydalanilayotgani
          haqida. Qolgani xona kartasida emas, tahlilda. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" />
          {/* `?? "—"`: sig'im kiritilmagan bo'lishi mumkin va "0 kishi"
              deb ko'rsatish YOLG'ON bo'lardi. */}
          {room.capacity ?? "—"}
        </span>
        <span className="inline-flex items-center gap-1">
          <BookOpen className="size-3" />
          {room.groupCount ?? 0} guruh
        </span>
        {room.isActive === false && <span>to'xtatilgan</span>}
      </div>
    </div>
  </div>
);

const AddRoomCard = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl",
      "border border-dashed border-border bg-card/50 text-muted-foreground transition",
      "hover:border-primary/40 hover:bg-muted hover:text-foreground",
    )}
  >
    <Plus className="size-6" strokeWidth={1.5} />
    <span className="text-sm font-medium">Xona qo'shish</span>
  </button>
);

/**
 * @param {object} props
 * @param {string} [props.branchId] — filial konteksti (Super Admin).
 *   Berilmasa: server foydalanuvchining ko'lamini qo'llaydi (Admin).
 */
const RoomsGrid = ({ branchId, enabled = true }) => {
  const { has } = usePermissions();
  const { openModal } = useModal();

  const canRead = has(PERMISSIONS.CLASSES_READ);
  const canCreate = has(PERMISSIONS.CLASSES_CREATE);
  const canDelete = has(PERMISSIONS.CLASSES_DELETE);

  const params = branchId ? { branchId } : {};
  const rooms = useRoomsQuery(params, { enabled: enabled && canRead });
  const remove = useRoomRemoveMutation();

  const openCreate = () =>
    // `branchId` BERILGANDA modal filial tanlagichini umuman
    // ko'rsatmaydi (`RoomCreateModal`), ya'ni kontekst yo'qolmaydi.
    openModal(MODAL.ROOM_CREATE, branchId ? { branchId } : undefined);

  if (!canRead) {
    return (
      <EmptyState
        icon={DoorOpen}
        title="Xonalar yopiq"
        hint="Bu bo'limni ochish uchun xonalarni ko'rish ruxsati kerak."
      />
    );
  }

  const list = rooms.data?.data || [];

  if (rooms.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (rooms.isError) {
    return (
      <EmptyState
        icon={DoorOpen}
        title="Xonalar ro'yxati kelmadi"
        hint="Ulanishni tekshirib, qaytadan urinib ko'ring."
      />
    );
  }

  // BO'SH HOLAT O'RGATADI, "ma'lumot yo'q" DEMAYDI: xonasiz guruh
  // jadvali tuzilmaydi va tizim darsning qayerda o'tishini bilmaydi.
  if (!list.length) {
    return (
      <EmptyState
        icon={DoorOpen}
        title="Bu filialda hali xona yo'q"
        hint="Xonasiz guruh jadvali tuzilmaydi — tizim darsning qayerda o'tishini bilmaydi va bandlik hisobi ham ishlamaydi."
        action={
          canCreate && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              Birinchi xonani qo'shish
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((room) => (
        <RoomCard
          key={room.id || room._id}
          room={room}
          canDelete={canDelete}
          deleting={remove.isPending}
          onDelete={(r) => remove.mutate(r.id || r._id)}
        />
      ))}
      {canCreate && <AddRoomCard onClick={openCreate} />}
    </div>
  );
};

export default RoomsGrid;
