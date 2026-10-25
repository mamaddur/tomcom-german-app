/**
 * Outbound SMS (DLT-registered gateway in production, pack 4.5). Implementations live in this
 * folder only (ADR-010). They must never log the phone number or the message text.
 */
export interface SmsProvider {
  sendOtp(e164Phone: string, otp: string, locale: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
