import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { SUPPORTED_LOCALES } from '../../common/locales.js';

export class ConsentNoticeQueryDto {
  @ApiProperty({ enum: SUPPORTED_LOCALES, required: false })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;
}

export class ConsentPurposeDto {
  @ApiProperty() id!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty() label!: string;
}

export class ConsentNoticeDto {
  @ApiProperty() version!: number;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) locale!: string;
  @ApiProperty() title!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ type: [ConsentPurposeDto] }) purposes!: ConsentPurposeDto[];
}
