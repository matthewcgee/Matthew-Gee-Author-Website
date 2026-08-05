import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Change this if the app ever moves to its own domain — see HANDOFF.md.
  base: '/Matthew-Gee-Author-Website/volleyball/',
  build: {
    outDir: '../volleyball',
    emptyOutDir: true,
  },
})
