import { useMemo } from "react";

import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import { ROLE_TYPES } from "@/shared/constants/roles";
import {
  WORKSPACES,
  WORKSPACE_META,
  resolveWorkspace,
} from "@/shared/workspaces/workspaces";
import { navFor } from "@/shared/workspaces/navigation";

/**
 * JORIY ISH MAKONI + uning navigatsiyasi.
 *
 * YAGONA MANBA: qobiq (sidebar), bosh sahifa va "bu odam nima
 * qila oladi" haqidagi UX qarorlari shu yerdan chiqadi. Ikkita
 * komponent ikki xil hisoblasa, menyu bir joyda bor, boshqa joyda
 * yo'q bo'lib qolardi.
 *
 * XAVFSIZLIK EMAS — faqat ko'rinish. Serverdagi tekshiruv o'z
 * o'rnida qoladi (qarang workspaces.js dagi izoh).
 */
const useWorkspace = () => {
  const auth = useAuth();
  const { has } = usePermissions();

  const workspace = useMemo(
    () => resolveWorkspace(auth, has),
    // `permissions` massivi har render'da yangi bo'lishi mumkin —
    // shuning uchun uzunlik + rol bo'yicha bog'lanamiz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth.role, auth.roleType, auth.permissions?.length, auth.isLoading],
  );

  // O'qituvchi — xodim makonining ALOHIDA ko'rinishi: manzillari
  // `/teacher/*` paneliga ketadi (qarang navigation.js izohi).
  const isTeacher = (auth.roleType || auth.role) === ROLE_TYPES.TEACHER;
  const nav = useMemo(() => navFor(workspace, { isTeacher }), [workspace, isTeacher]);
  const meta = WORKSPACE_META[workspace];

  return {
    workspace,
    nav,
    meta,
    home: meta?.home || "/me",
    isSuperAdmin: workspace === WORKSPACES.SUPER_ADMIN,
    isAdmin: workspace === WORKSPACES.ADMIN,
    isStaff: workspace === WORKSPACES.STAFF,
    isTeacher,
    isStudent: workspace === WORKSPACES.STUDENT,
    isLoading: auth.isLoading,
  };
};

export default useWorkspace;
