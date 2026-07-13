import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const localFirebase = path.resolve('./src/lib/firebase-local.js')

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '/tmp/acuitas-demo',
    emptyOutDir: true,
    assetsInlineLimit: 65536,
  },
  resolve: {
    alias: [
      // Replace the real Firebase module with the localStorage mock
      { find: /.*\/lib\/firebase\.js$/, replacement: localFirebase },
      { find: 'firebase/firestore', replacement: localFirebase },
      { find: 'firebase/app',       replacement: localFirebase },
    ],
  },
})
