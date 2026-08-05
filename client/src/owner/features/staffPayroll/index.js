export { default as StaffPayrollTab } from "./pages/StaffPayrollTab";
export { default as KpiRulesTab } from "./pages/KpiRulesTab";
export { default as StaffSalaryCard } from "./components/StaffSalaryCard";
export { staffPayrollAPI } from "./api/staffPayroll.api";
export {
  useStaffPayrollListQuery,
  useStaffPayrollQuery,
  useStaffPayrollHistoryQuery,
  useStaffCompensationsQuery,
  useKpiRulesQuery,
  useKpiTriggersQuery,
} from "./hooks/useStaffPayroll";
