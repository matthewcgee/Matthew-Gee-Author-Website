import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Where the app is served from and where the build goes are read from the
// environment (or a .env.production file — see .env.example), so an internal
// copy of this repository never needs a source edit to build for its own host.
//
// The defaults are the public demonstration site: matthewcgee.com is a custom
// domain (see /CNAME) that serves the website repository at its root, so the
// app lives at matthewcgee.com/acuity/ and builds into ../acuity. Pointing the
// base at the wrong path makes every asset 404 and the page render blank.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: env.ACUITAS_BASE || '/acuity/',
    build: {
      outDir: env.ACUITAS_OUT_DIR || '../acuity',
      emptyOutDir: true,
    },
    test: {
      setupFiles: ['./src/test/fixedClock.js'],
    },
  }
})
