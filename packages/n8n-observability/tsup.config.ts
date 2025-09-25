import { defineConfig } from 'tsup';

export default defineConfig([
  // Backend hooks file (CommonJS for EXTERNAL_HOOK_FILES compatibility)
  {
    entry: { hooks: 'src/hooks.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node18',
    clean: false,
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
      // '@opentelemetry/*',
      // 'langwatch/*',
      '*.node'
    ],
  },
]);
