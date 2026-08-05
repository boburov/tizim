// TanStack Query
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// API
import { qk } from "@/shared/lib/query/keys";
import { staffPayrollAPI } from "../api/staffPayroll.api";
import { apiErrorToast } from "@/shared/utils/apiError";
import { unwrapApproval, approvalToast } from "@/shared/utils/approvalResponse";

// --- QUERY'lar ---

export const useStaffPayrollListQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.list(params),
    queryFn: () => staffPayrollAPI.list(params).then((r) => r.data),
    ...options,
  });

export const useStaffPayrollQuery = (id, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.one(id),
    queryFn: () => staffPayrollAPI.byId(id).then((r) => r.data.data),
    enabled: Boolean(id),
    ...options,
  });

export const useStaffPayrollHistoryQuery = (employeeId, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.byEmployee(employeeId),
    queryFn: () => staffPayrollAPI.byEmployee(employeeId).then((r) => r.data.data),
    enabled: Boolean(employeeId),
    ...options,
  });

export const useStaffCompensationsQuery = (employeeId, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.compensations(employeeId),
    queryFn: () =>
      staffPayrollAPI.compensationsByEmployee(employeeId).then((r) => r.data.data),
    enabled: Boolean(employeeId),
    ...options,
  });

export const useKpiRulesQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.rules(params),
    queryFn: () => staffPayrollAPI.rules(params).then((r) => r.data.data),
    ...options,
  });

// Triggerlar kod bilan birga keladi - deploy'gacha o'zgarmaydi.
export const useKpiTriggersQuery = (options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.triggers(),
    queryFn: () => staffPayrollAPI.triggers().then((r) => r.data.data),
    staleTime: 30 * 60 * 1000,
    ...options,
  });

export const useKpiAssignmentsQuery = (employeeId, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.assignments(employeeId),
    queryFn: () => staffPayrollAPI.assignments(employeeId).then((r) => r.data.data),
    enabled: Boolean(employeeId),
    ...options,
  });

/**
 * MAOSH TARIXI HOLATI - "ishga olingan sanani o'zgartirsam nima bo'ladi?".
 *
 * So'rov HECH NARSANI o'zgartirmaydi: u faqat mavjud oylarni, qulflangan
 * va to'langanlarini sanaydi. Tasdiqlash oynasi shu javobga qarab
 * ko'rsatiladi (tarix bo'sh bo'lsa - ortiqcha bosish qilmaymiz).
 */
export const usePayrollImpactQuery = (employeeId, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.impact(employeeId),
    queryFn: () => staffPayrollAPI.impact(employeeId).then((r) => r.data.data),
    enabled: Boolean(employeeId),
    ...options,
  });

/** Xodimning moliyaviy TAYMLAYNI - audit tarixi. */
export const usePayrollTimelineQuery = (employeeId, options = {}) =>
  useQuery({
    queryKey: qk.staffPayroll.timeline(employeeId),
    queryFn: () => staffPayrollAPI.timeline(employeeId).then((r) => r.data.data),
    enabled: Boolean(employeeId),
    ...options,
  });

// --- MUTATION'lar ---

// Maosh o'zgarganda kesh butunlay yangilanadi: bitta bonus oy summasini,
// ro'yxatni va xodim tarixini birdan o'zgartiradi.
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.staffPayroll.all() });
};

// Umumiy mutatsiya qolipi. Nomi `use` bilan boshlanadi - ichida hook
// chaqiriladi va u faqat boshqa hooklardan chaqiriladi.
const usePayrollMutation = (fn, successText, options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars, ctx) => {
      invalidate();
      if (successText) toast.success(successText);
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useSetCompensationMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.setCompensation(body).then((r) => r.data.data),
    "Maosh shartnomasi saqlandi",
    options,
  );

export const useAdjustmentCreateMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.createAdjustment(body).then((r) => r.data.data),
    null, // xabar `kind`ga bog'liq - chaqiruvchi o'zi ko'rsatadi
    options,
  );

export const useAdjustmentRemoveMutation = (options = {}) =>
  usePayrollMutation(
    (id) => staffPayrollAPI.removeAdjustment(id).then((r) => r.data.data),
    "Yozuv o'chirildi",
    options,
  );

export const useRecomputeMutation = (options = {}) =>
  usePayrollMutation(
    (id) => staffPayrollAPI.recompute(id).then((r) => r.data.data),
    "Qayta hisoblandi",
    options,
  );

export const useLifecycleMutation = (options = {}) =>
  usePayrollMutation(
    ({ id, lifecycle }) =>
      staffPayrollAPI.setLifecycle(id, lifecycle).then((r) => r.data.data),
    null,
    options,
  );

export const useGenerateMonthMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.generate(body).then((r) => r.data.data),
    "Maoshlar hisoblandi",
    options,
  );

export const useKpiRuleMutation = (options = {}) =>
  usePayrollMutation(
    ({ id, body }) =>
      id
        ? staffPayrollAPI.updateRule(id, body).then((r) => r.data.data)
        : staffPayrollAPI.createRule(body).then((r) => r.data.data),
    "KPI qoidasi saqlandi",
    options,
  );

export const useKpiRuleRemoveMutation = (options = {}) =>
  usePayrollMutation(
    (id) => staffPayrollAPI.removeRule(id).then((r) => r.data.data),
    "KPI qoidasi o'chirildi",
    options,
  );

export const useKpiAssignmentMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.setAssignment(body).then((r) => r.data.data),
    "Biriktiruv saqlandi",
    options,
  );

export const useGenerateRangeMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.generateRange(body).then((r) => r.data),
    null,
    options,
  );

export const useRecalcUnlockedMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.recalculate(body).then((r) => r.data),
    null,
    options,
  );

/**
 * QURUQ YUGURISH - DB'ga hech narsa yozilmaydi.
 *
 * Mutatsiya sifatida yozilgan (query emas): u foydalanuvchi tugmani
 * bosganda ATAYLAB ishga tushadi va keshlanmasligi kerak.
 */
export const usePreviewMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.preview(body).then((r) => r.data.data),
    null,
    options,
  );

export const usePayrollStartMutation = (options = {}) =>
  usePayrollMutation(
    ({ employeeId, ...body }) =>
      staffPayrollAPI.setPayrollStart(employeeId, body).then((r) => r.data.data),
    "Maosh hisobining boshlanish sanasi saqlandi",
    options,
  );

export const usePayrollLockMutation = (options = {}) =>
  usePayrollMutation(
    (body) => staffPayrollAPI.setLock(body).then((r) => r.data.data),
    null,
    options,
  );

/**
 * TO'LOV - tasdiq oqimi bilan.
 *
 * Server chegaradan oshgan summani 202 bilan qaytaradi va PUL HARAKAT
 * QILMAYDI. Shunda ma'lumot querylarini yangilash NOTO'G'RI bo'lardi
 * (hech narsa o'zgarmagan) - faqat tasdiqlar ro'yxati yangilanadi.
 */
export const usePayoutMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      staffPayrollAPI.createTransaction(body).then(unwrapApproval),
    onSuccess: (res, vars, ctx) => {
      if (res.pendingApproval) {
        qc.invalidateQueries({ queryKey: qk.expenseApprovals.all() });
      } else {
        qc.invalidateQueries({ queryKey: qk.staffPayroll.all() });
      }
      approvalToast(toast, res, "To'lov yozildi");
      options.onSuccess?.(res, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
