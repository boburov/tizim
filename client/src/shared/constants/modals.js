// Modal keys - also used as the Redux store name; never hardcode the string elsewhere
export const MODAL = Object.freeze({
  // Students
  STUDENT_CREATE: "student:create",
  STUDENT_EDIT: "student:edit",
  STUDENT_DELETE: "student:delete",

  // Teachers
  TEACHER_CREATE: "teacher:create",
  TEACHER_EDIT: "teacher:edit",
  TEACHER_DELETE: "teacher:delete",

  // Classes
  CLASS_CREATE: "class:create",
  CLASS_EDIT: "class:edit",
  CLASS_DELETE: "class:delete",

  // Users (owner panel)
  USER_CREATE: "user:create",
  USER_EDIT: "user:edit",
  USER_DELETE: "user:delete",
  USER_RESTORE: "user:restore",
  USER_PERMANENT_DELETE: "user:permanentDelete",
  USER_PASSWORD: "user:password",
  USER_FREEZE: "user:freeze",
  USER_UNFREEZE: "user:unfreeze",

  // Archive reasons
  ARCHIVE_REASON_CREATE: "archiveReason:create",
  ARCHIVE_REASON_EDIT: "archiveReason:edit",
  ARCHIVE_REASON_DELETE: "archiveReason:delete",

  // Leads
  LEAD_CREATE: "lead:create",
  LEAD_EDIT: "lead:edit",
  LEAD_DELETE: "lead:delete",
  LEAD_CONVERT: "lead:convert",
  LEAD_REMINDER: "lead:reminder",
  LEAD_OPTION_CREATE: "leadOption:create",
  LEAD_OPTION_EDIT: "leadOption:edit",
  LEAD_OPTION_DELETE: "leadOption:delete",

  // Groups
  GROUP_CREATE: "group:create",
  GROUP_EDIT: "group:edit",
  GROUP_ASSIGN_TEACHER: "group:assignTeacher",
  GROUP_FINISH: "group:finish",
  GROUP_PERMANENT_DELETE: "group:permanentDelete",
  GROUP_ADD_STUDENT: "group:addStudent",
  STUDENT_ADD_TO_GROUP: "student:addToGroup",
  GROUP_REMOVE_STUDENT: "group:removeStudent",
  GROUP_STUDENT_PERIODS: "group:studentPeriods",

  // Student panel: guruhdan chiqarilganlik xabari
  STUDENT_REMOVED_NOTICE: "student:removedNotice",

  // Attendance
  ATTENDANCE_BULK_SAVE_CONFIRM: "attendance:bulkSaveConfirm",
  ATTENDANCE_EXEMPTION_CREATE: "attendanceExemption:create",
  ATTENDANCE_EXEMPTION_EDIT: "attendanceExemption:edit",
  ATTENDANCE_EXEMPTION_DELETE: "attendanceExemption:delete",


  // Notifications + Feedback (Bo'lak 7)
  NOTIFICATION_SEND: "notification:send",
  NOTIFICATION_CANCEL: "notification:cancel",
  NOTIFICATION_TEMPLATE_CREATE: "notificationTemplate:create",
  NOTIFICATION_TEMPLATE_EDIT: "notificationTemplate:edit",
  NOTIFICATION_TEMPLATE_DELETE: "notificationTemplate:delete",
  HOLIDAY_CREATE: "holiday:create",
  HOLIDAY_EDIT: "holiday:edit",
  HOLIDAY_DELETE: "holiday:delete",
  TEACHER_BIRTHDAY_CONGRATULATE: "teacherBirthday:congratulate",
  FEEDBACK_SUBMIT: "feedback:submit",
  FEEDBACK_REPLY: "feedback:reply",
  FEEDBACK_RESOLVE: "feedback:resolve",
  FEEDBACK_REJECT: "feedback:reject",
  FEEDBACK_TYPE_CREATE: "feedbackType:create",
  FEEDBACK_TYPE_EDIT: "feedbackType:edit",
  FEEDBACK_TYPE_DELETE: "feedbackType:delete",

  // Profil
  PROFILE_EDIT: "profile:edit",
  PROFILE_CHANGE_PASSWORD: "profile:changePassword",

  // Boshqaruv paneli (Bo'lak 9)
  ACTIVITY_LOG_DETAIL: "activityLog:detail",
  CHURNED_STUDENTS: "retention:churnedStudents",

  // Finance (Moliya)
  FINANCE_ADD_PAYMENT: "finance:addPayment",
  GROUP_FEE_EDIT: "finance:groupFeeEdit",
  DISCOUNT_CREATE: "finance:discountCreate",
  DISCOUNT_EDIT: "finance:discountEdit",
  DISCOUNT_DELETE: "finance:discountDelete",

  // Depozit (garov)
  DEPOSIT_ADD: "deposit:add",
  DEPOSIT_WITHDRAW: "deposit:withdraw",

  // Teacher salary (O'qituvchi maoshlari)
  SALARY_ADD_PAYOUT: "salary:addPayout",
  SALARY_PERIOD_CREATE: "salary:periodCreate",
  SALARY_PERIOD_EDIT: "salary:periodEdit",
});
