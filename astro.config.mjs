import { defineConfig } from 'astro/config';
export default defineConfig({
  site: process.env.SITE_URL || 'https://undefi.me',
  output: 'static',
  outDir: process.env.BUILD_DIR || './dist/site',
  trailingSlash: 'never',
  // ClientRouter navigation: fetch internal pages on hover/focus so the swap is usually instant.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
