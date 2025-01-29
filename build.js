import * as esbuild from 'esbuild'

const isDev = process.env.NODE_ENV !== 'production'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: isDev,
  minify: !isDev,
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
    // External dependencies
    '@dylibso/mcpx',
    '@mastra/core',
    'zod'
  ],
  // Add these optimizations
  logLevel: 'info',
  metafile: true,
  treeShaking: true,
  loader: { '.ts': 'ts' },
  plugins: isDev ? [
    {
      name: 'watch-plugin',
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length > 0) {
            console.error('Build failed:', result.errors)
          } else {
            console.log('Build succeeded')
          }
        })
      },
    },
  ] : []
})