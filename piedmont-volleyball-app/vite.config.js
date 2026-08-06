import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // matthewcgee.com is a custom domain (see /CNAME) that serves this repo at
  // its root, so the app lives at matthewcgee.com/piedmont-volleyball/.
  base: '/piedmont-volleyball/',
  build: {
    outDir: '../piedmont-volleyball',
    emptyOutDir: true,
  },
})
