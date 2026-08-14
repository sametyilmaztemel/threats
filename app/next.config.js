/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' }
  },
  outputFileTracingIncludes: {
    '/reports/export': ['./node_modules/pdfkit/js/data/*.afm'],
  },
};

module.exports = nextConfig;
