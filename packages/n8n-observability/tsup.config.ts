import { defineConfig } from 'tsup';

export default defineConfig([
  // Backend hooks file (CommonJS for EXTERNAL_HOOK_FILES compatibility)
  {
    entry: { index: 'src/index.ts', hooks: 'src/hooks.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node20',
    clean: true,
    sourcemap: true,
    dts: false,
    splitting: false,
    shims: false,
    minify: false,
    outDir: 'dist',
    outExtension() { return { js: '.cjs' }; },
    external: [
      'n8n-core',
      'n8n-workflow',
      '*.node'
    ],
  },
]);
