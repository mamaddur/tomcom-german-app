import { ApiError } from '../../common/api-error.js';
import type { SmsProvider } from './sms.provider.js';

/** Used when no gateway is configured (dev without keys): real numbers cannot sign in. */
export class DisabledSmsProvider implements SmsProvider {
  async sendOtp(): Promise<void> {
    throw new ApiError(503, 'sms_unavailable');
  }
}
