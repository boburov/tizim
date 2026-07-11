// Static role values (also stored as-is in the DB)
export const ROLES = Object.freeze({
  OWNER: "owner",
  TEACHER: "teacher",
  STUDENT: "student",
});

export const ROLE_LABELS = Object.freeze({
  owner: "Ega",
  teacher: "O'qituvchi",
  student: "O'quvchi",
});

export const ALL_ROLES = Object.values(ROLES);

// Default landing route per role
export const ROLE_HOME = Object.freeze({
  owner: "/owner",
  teacher: "/teacher",
  student: "/student",
});
