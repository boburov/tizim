import { Plus, Pencil, Trash2 } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useObjectState from "@/shared/hooks/useObjectState";
import { formatDateUz } from "@/shared/utils/formatDate";
import useStudentMembershipsQuery from "../../hooks/useStudentMembershipsQuery";
import useGroupAddStudentMutation from "../../hooks/useGroupAddStudentMutation";
import {
  useMembershipUpdateMutation,
  useMembershipRemoveMutation,
} from "../../hooks/useMembershipMutations";

const dateKey = (v) => (v ? String(v).slice(0, 10) : "");
const fmtDate = (v) => (v ? formatDateUz(v) : "hozir");
const todayKey = () => new Date().toISOString().slice(0, 10);

// group + student - ModalWrapper data orqali. O'quvchining shu guruhdagi o'qish
// davrlari (boshlanish/tugash). Qo'shish/tahrir inline forma orqali.
const GroupStudentPeriodsModal = ({ group, student, close }) => {
  const groupId = group?._id;
  const studentId = student?._id;

  const { data: periods = [], isLoading } = useStudentMembershipsQuery(groupId, studentId);

  const form = useObjectState({ visible: false, editId: "", joinedAt: "", leftAt: "" });

  const reset = () => form.setFields({ visible: false, editId: "", joinedAt: "", leftAt: "" });

  const addMut = useGroupAddStudentMutation({ onSuccess: reset });
  const updateMut = useMembershipUpdateMutation(groupId, studentId, { onSuccess: reset });
  const removeMut = useMembershipRemoveMutation(groupId, studentId);

  const openAdd = () =>
    form.setFields({ visible: true, editId: "", joinedAt: todayKey(), leftAt: "" });
  const openEdit = (p) =>
    form.setFields({
      visible: true,
      editId: p._id,
      joinedAt: dateKey(p.joinedAt),
      leftAt: dateKey(p.leftAt),
    });

  const submit = (e) => {
    e.preventDefault();
    if (form.editId) {
      updateMut.mutate({
        membershipId: form.editId,
        body: { joinedAt: form.joinedAt, leftAt: form.leftAt || null },
      });
    } else {
      addMut.mutate({
        id: groupId,
        studentId,
        joinedAt: form.joinedAt,
        leftAt: form.leftAt || null,
      });
    }
  };

  const pending = addMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {student?.firstName} {student?.lastName} - o'qish davrlari
        </span>
        {!form.visible && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" />
            Davr qo'shish
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : periods.length === 0 ? (
        <EmptyState title="O'qish davrlari yo'q" description="Davr qo'shing." />
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {periods.map((p) => (
            <li key={p._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-sm">
                {fmtDate(p.joinedAt)} - {fmtDate(p.leftAt)}
              </span>
              <div className="flex items-center gap-3">
                {p.leftAt == null && <StatusBadge tone="success">Aktiv</StatusBadge>}
                <button type="button" onClick={() => openEdit(p)} aria-label="Tahrirlash">
                  <Pencil className="size-4 text-muted-foreground hover:text-foreground" />
                </button>
                <button
                  type="button"
                  disabled={removeMut.isPending}
                  onClick={() => removeMut.mutate(p._id)}
                  aria-label="O'chirish"
                >
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form.visible && (
        <form onSubmit={submit} className="space-y-3 rounded-lg border bg-gray-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField
              name="joinedAt"
              type="date"
              label="Boshlanish sanasi"
              required
              value={form.joinedAt}
              onChange={(e) => form.setField("joinedAt", e.target.value)}
            />
            <InputField
              name="leftAt"
              type="date"
              label="Tugash sanasi"
              value={form.leftAt}
              onChange={(e) => form.setField("leftAt", e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={pending}>
              Bekor qilish
            </Button>
            <Button type="submit" disabled={pending || !form.joinedAt}>
              {pending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </div>
        </form>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => close?.()}>
          Yopish
        </Button>
      </div>
    </div>
  );
};

export default GroupStudentPeriodsModal;
