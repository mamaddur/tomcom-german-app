'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/** Same page in the other language. */
export function LocaleSwitch({ locale, label }: { locale: string; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other = locale === 'te' ? 'en' : 'te';
  const rest = pathname.replace(/^\/(te|en)/, '');
  return (
    <Link href={`/${other}${rest}${search ? `?${search}` : ''}`} lang={other}>
      {label}
    </Link>
  );
}
