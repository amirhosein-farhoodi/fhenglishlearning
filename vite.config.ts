import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Writes dist/sw.js from src/sw/sw.js, filling in the files to cache at install
 * and a version that changes whenever any of them does.
 *
 * The precache is the app shell only: the entry bundle, its CSS, and the page
 * chunks. Lesson content (hundreds of chunks under src/content) is left out and
 * cached by the worker as each lesson is opened.
 */
function serviceWorker(): Plugin {
  const STATIC = [
    '/index.html',
    '/manifest.webmanifest',
    '/favicon-48.png',
    '/apple-touch-icon.png',
    '/logo-mark.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
  ]
  return {
    name: 'fh-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files: string[] = []
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset') {
          if (file.fileName.endsWith('.css')) files.push(file.fileName)
          continue
        }
        const ids = file.facadeModuleId ? [file.facadeModuleId] : Object.keys(file.modules)
        const isContent = ids.length > 0 && ids.every((id) => id.includes('/src/content/'))
        if (!isContent) files.push(file.fileName)
      }
      const precache = [...STATIC, ...files.sort().map((f) => `/${f}`)]
      const version = createHash('sha256')
        .update(Object.keys(bundle).sort().join('\n'))
        .digest('hex')
        .slice(0, 12)
      const source = readFileSync(new URL('./src/sw/sw.js', import.meta.url), 'utf8')
        .replace("const VERSION = '__VERSION__'", `const VERSION = ${JSON.stringify(version)}`)
        .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(precache)}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
