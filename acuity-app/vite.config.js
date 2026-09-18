import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // matthewcgee.com is a custom domain (see /CNAME) that serves this repo at
  // its root, so the app lives at matthewcgee.com/acuity/ — not under
  // /Matthew-Gee-Author-Website/. Pointing at the project path makes every
  // asset 404 and the page render blank. Change this if that ever changes.
  base: '/acuity/',
  build: {
    outDir: '../acuity',
    emptyOutDir: true,
  },
})
