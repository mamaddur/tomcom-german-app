import pino from 'pino';
import { Writable } from 'node:stream';
import { redactingOptions } from './pino-options';
import { REDACTED, redactPii, scrubText } from './redact';

describe('scrubText', () => {
  it.each([
    ['call 9876543210 now', 'call [PHONE] now'],
    ['+91 98765 43210', '[PHONE]'],
    ['+91-9876543210', '[PHONE]'],
    ['09876543210', '[PHONE]'],
    ['synthetic +915500000002 too', 'synthetic [PHONE] too'],
    ['write to ravi.k@example.org', 'write to [EMAIL]'],
    ['otp: 482913 sent', 'otp: [OTP] sent'],
    ['code=1234', 'code=[OTP]'],
  ])('scrubs %p', (input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it('leaves non-PII numbers alone', () => {
    expect(scrubText('lesson 12 scored 85 in 1234 ms')).toBe('lesson 12 scored 85 in 1234 ms');
    expect(scrubText('order 5123456789')).toBe('order 5123456789'); // starts with 5: not a mobile
  });
});

describe('redactPii', () => {
  it('masks sensitive keys at any depth, case-insensitively', () => {
    const out = redactPii({
      user: { Phone: '9876543210', firstName: 'Ravi', level: 'A1' },
      headers: { authorization: 'Bearer abc', 'content-type': 'json' },
      list: [{ otp: '123456' }],
    });
    expect(out).toEqual({
      user: { Phone: REDACTED, firstName: REDACTED, level: 'A1' },
      headers: { authorization: REDACTED, 'content-type': 'json' },
      list: [{ otp: REDACTED }],
    });
  });

  it('scrubs error messages', () => {
    const out = redactPii(new Error('no user for 9876543210')) as { message: string };
    expect(out.message).toBe('no user for [PHONE]');
  });
});

describe('pino with redactingOptions', () => {
  it('never writes PII to the log stream', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = pino(redactingOptions, sink);
    log.info(
      { phone: '9876543210', district: 'Warangal', lessonId: 'L1' },
      'OTP sent to 9876543210',
    );
    const out = lines.join('');
    expect(out).not.toContain('9876543210');
    expect(out).not.toContain('Warangal');
    expect(out).toContain('L1');
    expect(out).toContain('OTP sent to [PHONE]');
  });
});
