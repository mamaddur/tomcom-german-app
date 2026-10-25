import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { DisabledSmsProvider } from './disabled-sms.provider.js';
import { SMS_PROVIDER, type SmsProvider } from './sms.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): SmsProvider => {
        switch (env.SMS_PROVIDER) {
          case 'none':
            return new DisabledSmsProvider();
        }
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
