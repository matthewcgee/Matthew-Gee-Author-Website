import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // matthewcgee.com is a custom domain (see /CNAME) that serves this repo at
  // its root, so the app lives at matthewcgee.com/volleyball/ — not under
  // /Matthew-Gee-Author-Website/. Change this if that ever changes.
  base: '/volleyball/',
  build: {
    outDir: '../volleyball',
    emptyOutDir: true,
  },
})
