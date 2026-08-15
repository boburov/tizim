import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { journalAPI } from "../api/journal.api";
import { apiErrorToast } from "@/shared/utils/apiError";

export const useBalancesQuery = (params = { treasuryOnly: true }) =>
  useQuery({
    queryKey: qk.journal.balances(params),
    queryFn: () => journalAPI.balances(params).then((r) => r.data.data),
  });

export const useShiftsQuery = (params) =>
  useQuery({
    queryKey: qk.journal.shifts(params),
    queryFn: () => journalAPI.shifts(params).then((r) => r.data),
  });

export const useTransfersQuery = (params) =>
  useQuery({
    queryKey: qk.journal.transfers(params),
    queryFn: () => journalAPI.transfers(params).then((r) => r.data),
  });

// Har bir mutatsiya BUTUN jurnalni invalidatsiya qiladi.
//
// Nozikroq qilish mumkin edi, lekin qoldiq, smena va inkassatsiya
// bir-biriga bog'liq: inkassatsiya jo'natilsa qoldiq ham o'zgaradi.
// Bittasini unutish "raqamlar mos kelmayapti" degan xato hisga olib
// kelardi - bu yerda esa u pul haqida.
const useJournalMutation = (fn, successMsg, options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.journal.all() });
      qc.invalidateQueries({ queryKey: qk.branchAnalytics.all() });
      toast.success(typeof successMsg === "function" ? successMsg(data) : successMsg);
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useOpenShiftMutation = (o) =>
  useJournalMutation((body) => journalAPI.openShift(body).then((r) => r.data.data), "Smena ochildi", o);

export const useCloseShiftMutation = (o) =>
  useJournalMutation(
    ({ id, body }) => journalAPI.closeShift(id, body).then((r) => r.data),
    (res) => res?.message || "Smena yopildi",
    o,
  );

export const useSendTransferMutation = (o) =>
  useJournalMutation((body) => journalAPI.send(body).then((r) => r.data.data), "Jo'natildi", o);

export const useReceiveTransferMutation = (o) =>
  useJournalMutation(
    ({ id, body }) => journalAPI.receive(id, body).then((r) => r.data),
    (res) => res?.message || "Qabul qilindi",
    o,
  );

export const useCancelTransferMutation = (o) =>
  useJournalMutation(
    (id) => journalAPI.cancelTransfer(id, {}).then((r) => r.data),
    "Bekor qilindi",
    o,
  );
