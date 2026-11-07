import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // matthewcgee.com serves this repo at its root (see /CNAME), so the app lives
  // at /psych-comp/ — never under /Matthew-Gee-Author-Website/, which 404s.
  base: '/psych-comp/',
  build: {
    outDir: '../psych-comp',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
})
