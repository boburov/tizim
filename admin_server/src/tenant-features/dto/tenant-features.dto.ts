import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetFeatureOverrideDto {
  /** true = majburan ochiq, false = majburan yopiq. */
  @IsBoolean()
  enabled!: boolean;

  /**
   * ⚠ MAJBURIY VA BO'SH BO'LMAYDI.
   *
   * Bu ustun qaror tarifni chetlab o'tadi, ya'ni pul oqimiga ta'sir
   * qiladi. Sababsiz yozuv olti oydan keyin "nega bu loyihada bepul?"
   * degan savolni javobsiz qoldiradi — o'shanda hech kim uni o'chirishga
   * ham jur'at qilmaydi, chunki nima buzilishini bilmaydi.
   */
  @IsString()
  @IsNotEmpty({ message: 'Sabab yozilishi shart' })
  @MaxLength(500)
  reason!: string;
}
