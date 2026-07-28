import { IsString } from 'class-validator';

export class DeleteTenantDto {
  /**
   * Noto'g'ri loyihani o'chirib yubormaslik uchun foydalanuvchi tenant
   * domenini aynan qayta yozishi shart.
   */
  @IsString()
  confirmDomain!: string;
}
