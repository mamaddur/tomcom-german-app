import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { ConsentController } from './consent.controller.js';
import { ConsentService } from './consent.service.js';
import { OtpService } from './otp.service.js';
import { StaffAuthController } from './staff-auth.controller.js';
import { StaffAuthService } from './staff-auth.service.js';
import { TokenService } from './token.service.js';

@Module({
  controllers: [AuthController, ConsentController, StaffAuthController],
  providers: [
    OtpService,
    TokenService,
    ConsentService,
    AccountService,
    StaffAuthService,
    // Every route requires a valid access token unless marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TokenService],
})
export class IdentityModule {}
