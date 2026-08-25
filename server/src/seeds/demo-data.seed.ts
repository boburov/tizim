import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransactionService } from '../modules/finance/transaction.service.js';
import { StudentPaymentService } from '../modules/finance/student-payment.service.js';
import { hashPassword } from '../common/utils/password.js';
import { Logger } from '@nestjs/common';

const logger = new Logger('DemoSeed');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const prisma = app.get(PrismaService);
    const txService = app.get(TransactionService);
    const paymentService = app.get(StudentPaymentService);

    const pw = await hashPassword('demo1234');
    
    // 1. Rollarni olish
    const studentRole = await prisma.role.findFirst({ where: { value: 'student' } });
    const teacherRole = await prisma.role.findFirst({ where: { value: 'teacher' } });
    const adminRole = await prisma.role.findFirst({ where: { value: 'owner' } });
    
    if (!studentRole || !teacherRole || !adminRole) {
      throw new Error("Rollar topilmadi. Avval 'npm run seed:permissions' va boshqa boshlang'ich seed'larni ishlating.");
    }

    const branchesData = ['DEMO Yunusobod', 'DEMO Chilonzor', 'DEMO Sergeli'];
    const now = new Date();
    
    // Orqaga 5 oy
    const months = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15); // O'rtasidagi sana
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, date: d });
    }

    for (const [index, branchName] of branchesData.entries()) {
      logger.log(`\n=== Yaratilmoqda: ${branchName} ===`);
      
      // Filial yaratish
      const branch = await prisma.branch.create({
        data: {
          name: branchName,
          isActive: true,
          isMain: false,
          address: 'Toshkent shahar',
          phone: '+99890123456' + index,
        }
      });
      logger.log(`Filial yaratildi: ${branch.id}`);

      // Kurs yaratish
      const course = await prisma.course.create({
        data: {
          name: `Ingliz tili - ${branchName}`,
          description: 'Umumiy ingliz tili',
          durationMonths: 6,
          lessonsPerMonth: 12,
          isActive: true,
          branchId: branch.id,
        }
      });

      // Narx yaratish
      await prisma.coursePrice.create({
        data: {
          courseId: course.id,
          branchId: branch.id,
          price: 500000,
          currency: 'UZS',
        }
      });

      // Xona yaratish
      const room = await prisma.room.create({
        data: {
          name: `Xona ${index + 1}`,
          capacity: 20,
          branchId: branch.id,
          isActive: true,
        }
      });

      // O'qituvchi yaratish
      const teacher = await prisma.user.create({
        data: {
          firstName: `Teacher`,
          lastName: `${index + 1}`,
          username: `demo_teacher_${index + 1}`,
          passwordHash: pw,
          roleId: teacherRole.id,
          homeBranchId: branch.id,
          isActive: true,
          assignments: {
            create: { branchId: branch.id, roleId: teacherRole.id }
          }
        }
      });

      // Guruh yaratish
      const startDate = new Date(now.getFullYear(), now.getMonth() - 4, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
      
      const group = await prisma.group.create({
        data: {
          name: `General English ${index + 1}`,
          courseId: course.id,
          teacherId: teacher.id,
          roomId: room.id,
          branchId: branch.id,
          startDate,
          endDate,
          status: 'active',
          price: 500000,
          type: 'standard',
          capacity: 15,
        }
      });
      logger.log(`Guruh yaratildi: ${group.id}`);

      // Guruhga o'quvchilar qo'shish (7 ta)
      for (let s = 1; s <= 7; s++) {
        const student = await prisma.user.create({
          data: {
            firstName: `Student`,
            lastName: `${s} (Branch ${index + 1})`,
            username: `demo_student_b${index+1}_s${s}`,
            passwordHash: pw,
            roleId: studentRole.id,
            homeBranchId: branch.id,
            isActive: true,
            assignments: {
              create: { branchId: branch.id, roleId: studentRole.id }
            }
          }
        });

        // A'zolik
        const membership = await prisma.groupMembership.create({
          data: {
            groupId: group.id,
            studentId: student.id,
            joinedAt: startDate,
            price: 500000,
            status: 'active',
          }
        });

        // 5 oylik to'lovlar yaratish
        for (const m of months) {
          // generateMonth orqali reja yaratish
          await paymentService.generateMonth(m.year, m.month);

          // Plandan to'lovni topish
          const plan = await prisma.studentPayment.findUnique({
             where: {
               studentId_groupId_year_month_isOpening: {
                 studentId: student.id,
                 groupId: group.id,
                 year: m.year,
                 month: m.month,
                 isOpening: false,
               }
             }
          });

          if (plan) {
            // Agar plan qarz bo'lsa (expectedAmount > 0)
            if (plan.expectedAmount > 0) {
              // Simulyatsiya: O'quvchilar 80% holatda to'liq, 20% holatda chala yoki umuman to'lamasligi mumkin
              const rand = Math.random();
              let payAmount = 0;
              if (rand < 0.8) {
                payAmount = plan.expectedAmount; // To'liq to'lov
              } else if (rand < 0.9) {
                payAmount = plan.expectedAmount / 2; // Chala to'lov
              }

              if (payAmount > 0) {
                const adminUser = { id: 'seed' }; // currentUser o'rniga mock admin object
                await txService.create({
                  paymentId: plan.id,
                  amount: payAmount,
                  method: 'cash',
                  paidAt: m.date.toISOString(),
                  note: 'Demo seed to\'lovi'
                }, adminUser);
              }
            }
          }
        }
      }
      logger.log(`Filial ${branchName} bo'yicha to'lovlar generatsiya qilindi.`);
    }

    logger.log('--- BARCHA DEMO MA\'LUMOTLAR YARATILDI ---');
  } catch (err) {
    logger.error(`Seed xatosi: ${(err as Error).message}`, (err as Error).stack);
  } finally {
    await app.close();
  }
}
void run();
