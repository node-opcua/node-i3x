import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    minify: true,
    sourcemap: true,
    esbuildOptions(options) {
      options.sourcesContent = false;
    },
    clean: true,
    external: [
      /^@node-i3x\//,
      /^node-opcua/,
      /^fastify/,
      '@fastify/cors',
    ],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/client.ts'],
    format: ['esm'],
    minify: true,
    sourcemap: true,
    esbuildOptions(options) {
      options.sourcesContent = false;
    },
    external: [
      /^@node-i3x\//,
      /^node-opcua/,
      /^fastify/,
      '@fastify/cors',
    ],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
