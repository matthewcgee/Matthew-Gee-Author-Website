import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Where the app is served from and where the build goes are read from the
// environment (or a .env.production file — see .env.example), so an internal
// copy of this repository never needs a source edit to build for its own host.
//
// The defaults are the public demonstration site: matthewcgee.com is a custom
// domain (see /CNAME) that serves the website repository at its root, so the
// app lives at matthewcgee.com/acuity/ and builds into ../acuity. Pointing the
// base at the wrong path makes every asset 404 and the page render blank.
//
// Only a build that sets VITE_FIREBASE_CONFIG (and not VITE_BACKEND=api/local)
// uses Firebase. Every other build swaps the two Firebase modules for a stub,
// so it neither contains nor needs the Firebase library.
const here = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const usesFirebase = !!env.VITE_FIREBASE_CONFIG && !['api', 'local'].includes(env.VITE_BACKEND) || env.VITE_AUTH_MODE === 'firebase'
  const stub = here('./src/lib/backend/firebaseStub.js')
  return {
    plugins: [react()],
    resolve: usesFirebase ? {} : {
      alias: [
        { find: /^\.\/firebaseBackend\.js$/, replacement: stub },
        { find: /^\.\/backend\/firebaseBackend\.js$/, replacement: stub },
        { find: /^\.\/firebaseAuth\.js$/, replacement: stub },
      ],
    },
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
