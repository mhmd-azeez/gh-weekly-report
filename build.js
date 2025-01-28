import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  external: [
    // Node.js built-in modules
    'node:*',
    'os',
    'fs',
    'path',
    'events',
    'stream',
    'util',
    'crypto',
    // You might need to add other external dependencies here
    '@dylibso/mcpx',
    '@mastra/core'
  ]
})