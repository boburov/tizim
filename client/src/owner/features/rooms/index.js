/**
 * XONALAR — PUBLIC API.
 *
 * `RoomsGrid` ataylab eksport qilinadi: uni Super Admin panelining
 * filial kartasi ham ishlatadi. Bitta xona ekrani, ikki panel
 * (talab 34) — nusxa yo'q.
 */
export { default as RoomsPage } from "./pages/RoomsPage";
export { default as SchedulePage } from "./pages/SchedulePage";
export { default as RoomsGrid } from "./components/RoomsGrid";
export { default as RoomUtilizationSection } from "./components/RoomUtilizationSection";
export { default as useRoomUtilizationQuery } from "./hooks/useRoomUtilizationQuery";
