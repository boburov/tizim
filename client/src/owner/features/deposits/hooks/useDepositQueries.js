import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { depositsAPI } from "../api/deposits.api";

export const useDepositSummaryQuery = (studentId) =>
  useQuery({
    queryKey: qk.deposits.studentSummary(studentId),
    queryFn: () => depositsAPI.studentSummary(studentId).then((r) => r.data.data),
    enabled: !!studentId,
  });

export const useDepositHistoryQuery = (studentId) =>
  useQuery({
    queryKey: qk.deposits.studentHistory(studentId),
    queryFn: () => depositsAPI.studentHistory(studentId).then((r) => r.data.data),
    enabled: !!studentId,
  });

export const useDepositTransactionsQuery = (params) =>
  useQuery({
    queryKey: qk.deposits.transactions(params),
    queryFn: () => depositsAPI.transactions(params).then((r) => r.data),
  });

export const useDepositReportQuery = (params) =>
  useQuery({
    queryKey: qk.deposits.report(params),
    queryFn: () => depositsAPI.report(params).then((r) => r.data.data),
  });
