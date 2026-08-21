import { Injectable } from '@nestjs/common';
import type { Importer } from './import-engine.service.js';
import { StudentsImporter } from './importers/students.importer.js';
import { TeachersImporter } from './importers/teachers.importer.js';
import { StaffImporter } from './importers/staff.importer.js';
import { StudentPaymentsImporter } from './importers/student-payments.importer.js';
import { TeacherSalaryPaymentsImporter } from './importers/teacher-salary-payments.importer.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPORT REYESTRI — eksport reyestri bilan BIR XIL mantiq.
 *
 * Yangi modul qo'shish uchun bitta sinf yoziladi (shartnoma:
 * `key/label/permission/columns/prepare/validateRow/dedupeKey/commitRow`)
 * va shu yerga ulanadi. Dvigatel (`ImportEngineService`), shablon
 * generatori, yuklash oynasi va xatolik hisoboti — hammasi UMUMIY.
 *
 * ⚠ TARTIB Express bilan bir xil: `listImporters()` javobi client'da
 * ro'yxat bo'lib chiziladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ImportRegistryService {
  private readonly importers: Record<string, Importer>;

  constructor(
    students: StudentsImporter,
    teachers: TeachersImporter,
    staff: StaffImporter,
    studentPayments: StudentPaymentsImporter,
    teacherSalaryPayments: TeacherSalaryPaymentsImporter,
  ) {
    this.importers = Object.freeze({
      [students.key]: students,
      [teachers.key]: teachers,
      [staff.key]: staff,
      [studentPayments.key]: studentPayments,
      [teacherSalaryPayments.key]: teacherSalaryPayments,
    }) as Record<string, Importer>;
  }

  getImporter(key: string): Importer | null {
    return this.importers[key] || null;
  }

  listImporters(): Importer[] {
    return Object.values(this.importers);
  }
}
