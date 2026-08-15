// React
import { useState } from "react";

// Icons
import { Plus, Trash2, DoorOpen, GraduationCap, Coins } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Input from "@/shared/components/ui/input/Input";
import InputMoney from "@/shared/components/ui/input/InputMoney";
import DataTable from "@/shared/components/ui/table/DataTable";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import usePermissions from "@/shared/hooks/usePermissions";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import {
  useCoursesQuery,
  useRoomsQuery,
  useCoursePricesQuery,
  useCourseCreateMutation,
  useCourseRemoveMutation,
  useRoomCreateMutation,
  useRoomRemoveMutation,
  useSetPriceMutation,
  useClearPriceMutation,
} from "../hooks/useCatalogQueries";

const fmt = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(n || 0));

/**
 * NARX PANELI - tanlangan kursning bazaviy narxi va filial istisnolari.
 *
 * `isPending` bayrog'i MUHIM: narx kelajakda boshlanadigan bo'lsa, u
 * ro'yxatda ko'rinadi, lekin HALI hisoblanmaydi. Bayroqsiz owner
 * matritsada 600 000 ni ko'rib, hisobotda 500 000 ni topib chalkashardi.
 */
const PricePanel = ({ course }) => {
  const { data, isLoading } = useCoursePricesQuery(course?._id);
  const { activeBranch, isAllBranches } = useActiveBranch();
  const [amount, setAmount] = useState("");

  const setPrice = useSetPriceMutation({ onSuccess: () => setAmount("") });
  const clearPrice = useClearPriceMutation();

  if (!course) return null;
  if (isLoading) {
    return <p className="py-4 text-center text-sm opacity-60">Yuklanmoqda...</p>;
  }

  const base = data?.base;
  const branches = data?.branches || [];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <Coins size={16} strokeWidth={2} />
        <h3 className="text-sm font-medium">{course.title} — narxlar</h3>
      </div>

      <div className="text-sm">
        <p className="text-xs text-muted-foreground">Bazaviy narx (butun tarmoq)</p>
        <p className="font-medium tabular-nums">
          {base ? fmt(base.amount) : "belgilanmagan"}
          {base?.isPending && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {new Date(base.validFrom).toLocaleDateString("uz-UZ")} dan boshlanadi
            </span>
          )}
        </p>
      </div>

      {branches.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Filial istisnolari</p>
          {branches.map((b) => (
            <div key={b._id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {b.branchId?.name}: <span className="tabular-nums">{fmt(b.amount)}</span>
                {b.isPending && (
                  <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-300">
                    (hali amalda emas)
                  </span>
                )}
              </span>
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                aria-label="Istisnoni olib tashlash"
                disabled={clearPrice.isPending}
                onClick={() =>
                  clearPrice.mutate({ id: course._id, branchId: b.branchId._id })
                }
              >
                <Trash2 size={13} strokeWidth={2} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {isAllBranches
              ? "Bazaviy narx (barcha filiallar)"
              : `${activeBranch?.name || "Filial"} uchun narx`}
          </span>
          <InputMoney
            value={amount}
            className="max-w-[170px]"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          disabled={setPrice.isPending || String(amount).trim() === ""}
          onClick={() =>
            setPrice.mutate({
              id: course._id,
              body: {
                // "Barcha filiallar" rejimida BAZAVIY narx, aniq filial
                // tanlangan bo'lsa - o'sha filial uchun ISTISNO.
                branchId: isAllBranches ? null : activeBranch?._id,
                amount: Number(amount),
              },
            })
          }
        >
          Saqlash
        </Button>
      </div>
    </div>
  );
};

/**
 * KATALOG - kurslar (global), xonalar (filial) va narx matritsasi.
 *
 * NEGA BITTA SAHIFA: uchalasi guruh yaratishda birga ishlatiladi -
 * "qaysi kurs, qaysi xonada, qanday narxda". Uch alohida sahifa bo'lsa
 * operator ular orasida sakrab yurardi.
 */
const CatalogPage = () => {
  const { has } = usePermissions();
  const canManageCourses = has("courses.manage");
  const canManageRooms = has("classes.create");

  const { data: coursesRes, isLoading: coursesLoading } = useCoursesQuery({});
  const { data: roomsRes, isLoading: roomsLoading } = useRoomsQuery({});

  const [selectedCourse, setSelectedCourse] = useState(null);

  const courseForm = useObjectState({ title: "", code: "", level: "" });
  const roomForm = useObjectState({ name: "", capacity: "", areaM2: "" });

  const createCourse = useCourseCreateMutation({ onSuccess: courseForm.resetState });
  const removeCourse = useCourseRemoveMutation();
  const createRoom = useRoomCreateMutation({ onSuccess: roomForm.resetState });
  const removeRoom = useRoomRemoveMutation();

  const courses = coursesRes?.data || [];
  const rooms = roomsRes?.data || [];

  const courseColumns = [
    {
      key: "title",
      header: "Kurs",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <button
          type="button"
          onClick={() => setSelectedCourse(r)}
          className="text-left text-sm font-medium hover:underline"
        >
          {r.title}
          {!r.isActive && (
            <span className="ml-2 text-xs text-muted-foreground">(nofaol)</span>
          )}
        </button>
      ),
    },
    {
      key: "code",
      header: "Kod",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "groups",
      header: "Guruhlar",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      // Bu son FILIAL bo'yicha kesilgan: katalog global, lekin
      // "IELTS - 12 guruh" ning 9 tasi boshqa filialda bo'lsa,
      // bu yolg'on ma'lumot bo'lardi.
      cell: (r) => <span className="text-sm tabular-nums">{r.groupCount}</span>,
    },
    ...(canManageCourses
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
            cell: (r) =>
              r.isActive ? (
                <Button
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label="Nofaol qilish"
                  disabled={removeCourse.isPending}
                  onClick={() => removeCourse.mutate(r._id)}
                >
                  <Trash2 size={13} strokeWidth={2} />
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  const roomColumns = [
    {
      key: "name",
      header: "Xona",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm font-medium">{r.name}</span>,
    },
    {
      key: "branch",
      header: "Filial",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm">{r.branchId?.name || "—"}</span>,
    },
    {
      key: "capacity",
      header: "Sig'im",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm tabular-nums">{r.capacity ?? "—"}</span>,
    },
    {
      key: "area",
      header: "Maydon",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <span className="text-sm tabular-nums">{r.areaM2 ? `${r.areaM2} m²` : "—"}</span>
      ),
    },
    {
      key: "groups",
      header: "Guruhlar",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm tabular-nums">{r.groupCount}</span>,
    },
    ...(canManageRooms
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
            cell: (r) => (
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                aria-label="O'chirish"
                disabled={removeRoom.isPending}
                onClick={() => removeRoom.mutate(r._id)}
              >
                <Trash2 size={13} strokeWidth={2} />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Katalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kurslar butun tarmoq uchun umumiy — filiallar o'zicha yangi nom
          o'ylab topa olmaydi. Xonalar esa har filialning o'z resursi.
        </p>
      </div>

      {/* ── KURSLAR ── */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <GraduationCap size={16} strokeWidth={2} />
          Kurslar
        </h2>

        {canManageCourses && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Nomi</span>
              <Input
                value={courseForm.title}
                className="max-w-[180px]"
                onChange={(e) => courseForm.setField("title", e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Kod (barqaror kalit)</span>
              <Input
                value={courseForm.code}
                placeholder="ielts"
                className="max-w-[140px]"
                onChange={(e) => courseForm.setField("code", e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Daraja</span>
              <Input
                value={courseForm.level}
                placeholder="B1"
                className="max-w-[100px]"
                onChange={(e) => courseForm.setField("level", e.target.value)}
              />
            </label>
            <Button
              disabled={
                createCourse.isPending ||
                !courseForm.title.trim() ||
                !courseForm.code.trim()
              }
              onClick={() => createCourse.mutate(courseForm.state)}
              className="gap-1.5"
            >
              <Plus size={16} strokeWidth={2} />
              Qo'shish
            </Button>
          </div>
        )}

        <DataTable
          rows={courses}
          columns={courseColumns}
          isLoading={coursesLoading}
          empty={
            <p className="py-8 text-center text-sm opacity-60">
              Kurslar yo'q — birinchisini qo'shing
            </p>
          }
        />
        <p className="text-xs text-muted-foreground">
          Narxni ko'rish uchun kurs nomiga bosing.
        </p>
      </section>

      {selectedCourse && <PricePanel course={selectedCourse} />}

      {/* ── XONALAR ── */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <DoorOpen size={16} strokeWidth={2} />
          Xonalar
        </h2>

        {canManageRooms && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Nomi</span>
              <Input
                value={roomForm.name}
                placeholder="3-xona"
                className="max-w-[150px]"
                onChange={(e) => roomForm.setField("name", e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Sig'im</span>
              <Input
                type="number"
                min="0"
                value={roomForm.capacity}
                className="max-w-[100px]"
                onChange={(e) => roomForm.setField("capacity", e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Maydon (m²)</span>
              <Input
                type="number"
                min="0"
                value={roomForm.areaM2}
                className="max-w-[110px]"
                onChange={(e) => roomForm.setField("areaM2", e.target.value)}
              />
            </label>
            <Button
              disabled={createRoom.isPending || !roomForm.name.trim()}
              onClick={() =>
                createRoom.mutate({
                  name: roomForm.name,
                  capacity: roomForm.capacity === "" ? null : Number(roomForm.capacity),
                  areaM2: roomForm.areaM2 === "" ? null : Number(roomForm.areaM2),
                })
              }
              className="gap-1.5"
            >
              <Plus size={16} strokeWidth={2} />
              Qo'shish
            </Button>
          </div>
        )}

        <DataTable
          rows={rooms}
          columns={roomColumns}
          isLoading={roomsLoading}
          empty={
            <p className="py-8 text-center text-sm opacity-60">
              Xonalar yo'q — bandlik hisobi uchun ularni kiriting
            </p>
          }
        />
      </section>
    </div>
  );
};

export default CatalogPage;
