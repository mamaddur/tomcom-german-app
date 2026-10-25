import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { DeviceDto } from './auth.dto.js';

export class StaffLoginDto {
  @ApiProperty({ example: '+915599990001' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class StaffChallengeDto {
  @ApiProperty({ description: 'Pass to POST /staff-auth/verify with the OTP' })
  challengeToken!: string;
  @ApiProperty() expiresInSeconds!: number;
  @ApiProperty() resendAfterSeconds!: number;
}

export class StaffVerifyDto {
  @ApiProperty()
  @IsString()
  @Length(20, 100)
  challengeToken!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ type: DeviceDto })
  @ValidateNested()
  @Type(() => DeviceDto)
  device!: DeviceDto;
}
