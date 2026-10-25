import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Studio audio uploads pass through server actions to the API (which caps uploads at 15 MB).
  experimental: { serverActions: { bodySizeLimit: '16mb' } },
};

export default withNextIntl(nextConfig);
