import { defineRouting } from 'next-intl/routing';

// Adding a language = add its code here and a messages/<code>.json file (NFR-16).
export const routing = defineRouting({
  locales: ['te', 'en'],
  defaultLocale: 'te',
});

export type Locale = (typeof routing.locales)[number];
