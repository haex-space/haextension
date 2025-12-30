import { defineConfig } from 'vite'
import { sharedConfig } from './vite.config.mjs'
import { isDev, r } from './scripts/utils'
import packageJson from './package.json'

// bundling the WebAuthn inject script using Vite
// This script runs in the MAIN world and intercepts WebAuthn API calls
export default defineConfig({
  ...sharedConfig,
  define: {
    '__DEV__': isDev,
    '__NAME__': JSON.stringify(packageJson.name),
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
  },
  build: {
    watch: isDev
      ? {}
      : undefined,
    outDir: r('extension/dist/contentScripts'),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: isDev ? 'inline' : false,
    lib: {
      entry: r('src/contentScripts/webauthn-inject.ts'),
      name: 'HaexPassWebAuthn',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        entryFileNames: 'webauthn-inject.js',
        extend: true,
      },
    },
  },
})
