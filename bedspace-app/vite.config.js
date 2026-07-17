import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Change this before deploying to Bethesda Center's own domain — see HANDOFF.md.
  // Use base: '/' for a root deployment (e.g. https://bedspace.bethesdacentersws.org/).
  base: '/Matthew-Gee-Author-Website/bedspace/',
  build: {
    outDir: '../bedspace',
    emptyOutDir: true,
  },
})
