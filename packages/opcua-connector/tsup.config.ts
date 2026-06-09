import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: { composite: false },
  },
  minify: true,
  sourcemap: true,
  esbuildOptions(options) {
    options.sourcesContent = false;
  },
  clean: true,
  external: [
    /^@node-i3x\//,
    /^node-opcua/,
  ],
});
