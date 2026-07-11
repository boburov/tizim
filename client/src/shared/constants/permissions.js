// Permission keys - same strings live in the DB
export const PERMISSIONS = Object.freeze({
  // Users
  USERS_READ: "users.read",
  ARCHIVE_REASONS_MANAGE: "archive_reasons.manage",

  // Leads
  LEADS_READ: "leads.read",
  LEADS_MANAGE: "leads.manage",

  // Students
  STUDENTS_READ: "students.read",
  STUDENTS_CREATE: "students.create",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",

  // Teachers
  TEACHERS_READ: "teachers.read",
  TEACHERS_CREATE: "teachers.create",
  TEACHERS_UPDATE: "teachers.update",
  TEACHERS_DELETE: "teachers.delete",

  // Classes
  CLASSES_READ: "classes.read",
  CLASSES_CREATE: "classes.create",
  CLASSES_UPDATE: "classes.update",
  CLASSES_DELETE: "classes.delete",

  // Groups
  GROUPS_READ: "groups.read",
  GROUPS_CREATE: "groups.create",
  GROUPS_UPDATE: "groups.update",
  GROUPS_DELETE: "groups.delete",
  GROUPS_MANAGE_STUDENTS: "groups.manage_students",

  // Attendance
  ATTENDANCE_READ: "attendance.read",
  ATTENDANCE_RECORD: "attendance.record",
  ATTENDANCE_MANAGE: "attendance.manage",

  // Grades (baholash) + Rating (reyting)
  GRADES_READ: "grades.read",
  GRADES_RECORD: "grades.record",
  GRADES_MANAGE: "grades.manage",
  RATING_READ: "rating.read",
  RATING_MANAGE: "rating.manage",

  // Notifications + Feedback
  NOTIFICATIONS_READ: "notifications.read",
  NOTIFICATIONS_SEND: "notifications.send",
  NOTIFICATION_TEMPLATES_MANAGE: "notification_templates.manage",
  HOLIDAYS_MANAGE: "holidays.manage",
  FEEDBACK_READ: "feedback.read",
  FEEDBACK_RESPOND: "feedback.respond",
  FEEDBACK_TYPES_MANAGE: "feedback_types.manage",

  // Admin / boshqaruv paneli (Bo'lak 9)
  ADMIN_DASHBOARD_READ: "admin_dashboard.read",
  ACTIVITY_LOGS_READ: "activity_logs.read",

  // Finance (Moliya)
  FINANCE_READ: "finance.read",
  FINANCE_PAY: "finance.pay",
  FINANCE_MANAGE: "finance.manage",

  // Teacher salary (O'qituvchi maoshlari)
  SALARY_READ: "salary.read",
  SALARY_PAY: "salary.pay",
});
