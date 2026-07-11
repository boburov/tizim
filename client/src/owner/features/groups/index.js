export { default as GroupsListPage } from "./pages/GroupsListPage";
export { default as GroupDetailPage } from "./pages/GroupDetailPage";
export { default as GroupInfoPanel } from "./components/tabs/GroupInfoPanel";
export { default as GroupStudentsPanel } from "./components/tabs/GroupStudentsPanel";
export { default as GroupAttendancePanel } from "./components/tabs/GroupAttendancePanel";

export { groupsAPI } from "./api/groups.api";

export { default as useGroupsListQuery } from "./hooks/useGroupsListQuery";
export { default as useGroupQuery } from "./hooks/useGroupQuery";

// O'qituvchi dars berish/maosh davrlari (moliya feature'i ham ishlatadi)
export {
  useTeacherPeriodsQuery,
  useTeacherPeriodCreateMutation,
  useTeacherPeriodUpdateMutation,
  useTeacherPeriodRemoveMutation,
} from "./hooks/useTeacherPeriods";
export { default as TeacherSinglePicker } from "./components/TeacherSinglePicker";
