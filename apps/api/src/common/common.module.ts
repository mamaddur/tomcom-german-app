import { Global, Module } from '@nestjs/common';
import { PiiCryptoService } from './pii-crypto.service.js';
import { RateLimiterService } from './rate-limiter.service.js';

@Global()
@Module({
  providers: [PiiCryptoService, RateLimiterService],
  exports: [PiiCryptoService, RateLimiterService],
})
export class CommonModule {}
