// Components
import Tooltip from "@/shared/components/ui/tooltip/Tooltip";
import PermissionSwitch, { SWITCH_STATE } from "./PermissionSwitch";

// Utils
import {
  sectionActions,
  getRowState,
  getColumnState,
  getGridState,
  toggleRow,
  toggleColumn,
  toggleGrid,
  toggleCell,
} from "../utils/grid.utils";

// Bitta bo'lim jadvali: qatorlar = modullar, ustunlar = amallar.
//
// Ustunlar SHU BO'LIM uchun hisoblanadi - butun tizimda 11 xil amal bor,
// lekin bir bo'limda 3-7 tasi uchraydi.
//
// MUHIM: kataklarning yarmidan ko'pi bo'sh (modulda bunday amal yo'q).
// Ular "—" bilan belgilanadi, aks holda foydalanuvchi "nega o'chirib
// bo'lmaydi?" deb o'ylardi - bo'sh katak "taqiqlangan" kabi ko'rinardi.
const SectionGrid = ({ items, actions, selected, onChange, disabled = false }) => {
  const cols = sectionActions(items, actions);

  const set = (next) => !disabled && onChange(next);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="w-[30%] min-w-[190px] px-4 py-3 text-left font-medium">
              <PermissionSwitch
                state={getGridState(items, selected)}
                onToggle={() => set(toggleGrid(selected, items))}
                disabled={disabled}
                label="Modul"
                ariaLabel="Bo'limdagi barcha ruxsatlar"
              />
            </th>

            {cols.map((action) => (
              <th
                key={action.key}
                className="border-l px-4 py-3 text-left font-medium"
              >
                <PermissionSwitch
                  state={getColumnState(items, action.key, selected)}
                  onToggle={() => set(toggleColumn(selected, items, action.key))}
                  disabled={disabled}
                  label={action.label}
                  ariaLabel={`${action.label} ustuni`}
                />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {items.map((module) => (
            <tr key={module.module} className="border-b last:border-b-0">
              <td className="px-4 py-2.5">
                <PermissionSwitch
                  state={getRowState(module, selected)}
                  onToggle={() => set(toggleRow(selected, module))}
                  disabled={disabled}
                  label={module.label}
                  ariaLabel={`${module.label} moduli`}
                />
              </td>

              {cols.map((action) => {
                const cell = module.cells?.[action.key];
                return (
                  <td key={action.key} className="border-l px-4 py-2.5">
                    {cell ? (
                      <PermissionSwitch
                        state={
                          selected.has(cell.id)
                            ? SWITCH_STATE.ON
                            : SWITCH_STATE.OFF
                        }
                        onToggle={() => set(toggleCell(selected, module, cell))}
                        disabled={disabled}
                        ariaLabel={cell.label}
                      />
                    ) : (
                      // Bu modulda bunday amal umuman mavjud emas.
                      <Tooltip
                        content={`"${module.label}" moduli uchun "${action.label}" amali mavjud emas`}
                      >
                        <span
                          className="inline-flex h-[22px] w-[38px] cursor-help items-center justify-center text-sm text-muted-foreground/40"
                          aria-label="Mavjud emas"
                        >
                          —
                        </span>
                      </Tooltip>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SectionGrid;
