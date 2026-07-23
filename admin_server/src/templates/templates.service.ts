import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Select uchun faqat faol tizimlar. */
  findActive() {
    return this.prisma.systemTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findAll() {
    return this.prisma.systemTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.systemTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tizim shabloni topilmadi');
    return t;
  }

  create(dto: CreateTemplateDto) {
    return this.prisma.systemTemplate.create({ data: dto });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findOne(id);
    return this.prisma.systemTemplate.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.systemTemplate.delete({ where: { id } });
  }
}
