// Acuitas data service as a plain Node.js web server — for Azure App Service,
// an on-premises server behind the organization's sign-in proxy, or local
// development. It serves the API under /api and, when ACUITAS_STATIC_DIR is
// set, the built app itself (one origin, no cross-site requests).
//
//   PORT                 listen port (default 8080)
//   ACUITAS_STATIC_DIR   folder holding the built app (e.g. ../dist)
//   ACUITAS_BASE         URL path the app is served from (default /)
//   plus the variables in src/config.js
//
// With ACUITAS_AUTH=dev (development only) it also stands in for the sign-in
// gateway: /.auth/login/dev?user=Name&role=charge sets a test identity and
// /.auth/me reports it, the same shape Azure Static Web Apps uses.

import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { serviceFromEnv } from './config.js'
import { MAX_BODY_BYTES } from './core/service.js'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function cookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function devIdentity(req) {
  try {
    const v = cookies(req).acuitas_dev
    return v ? JSON.parse(Buffer.from(v, 'base64').toString('utf8')) : null
  } catch {
    return null
  }
}

export function createServer(env = process.env) {
  const dev = env.ACUITAS_AUTH === 'dev'
  if (dev && env.NODE_ENV === 'production') throw new Error('ACUITAS_AUTH=dev is refused when NODE_ENV=production.')
  const staticDir = env.ACUITAS_STATIC_DIR ? path.resolve(env.ACUITAS_STATIC_DIR) : null
  const base = (env.ACUITAS_BASE || '/').replace(/\/?$/, '/')

  const send = (res, status, headers, body) => {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers })
    res.end(body)
  }

  async function serveStatic(req, res, url) {
    if (!staticDir || !url.pathname.startsWith(base)) return send(res, 404, { 'content-type': 'text/plain' }, 'Not found')
    const rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html'
    let file = path.resolve(staticDir, rel)
    if (!file.startsWith(staticDir)) return send(res, 400, { 'content-type': 'text/plain' }, 'Bad path')
    try {
      if (!(await stat(file)).isFile()) throw new Error('dir')
    } catch {
      file = path.join(staticDir, 'index.html') // single-page app fallback
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream'
    const cache = /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache'
    send(res, 200, { 'content-type': type, 'cache-control': cache }, await readFile(file))
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
      if (dev && url.pathname === '/.auth/login/dev') {
        const id = { name: url.searchParams.get('user') || 'Dev User', role: url.searchParams.get('role') || 'viewer' }
        const cookie = `acuitas_dev=${Buffer.from(JSON.stringify(id)).toString('base64')}; Path=/; HttpOnly; SameSite=Strict`
        return send(res, 302, { 'set-cookie': cookie, location: url.searchParams.get('to') || base }, '')
      }
      if (dev && url.pathname === '/.auth/me') {
        const id = devIdentity(req)
        const body = { clientPrincipal: id ? { identityProvider: 'dev', userDetails: id.name, userRoles: ['authenticated', `acuitas-${id.role}`] } : null }
        return send(res, 200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, JSON.stringify(body))
      }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const text = ['PUT', 'PATCH', 'POST'].includes(req.method) ? await readBody(req) : ''
        let body
        if (text) {
          try { body = JSON.parse(text) } catch { return send(res, 400, { 'content-type': 'application/json' }, '{"error":"The request body is not valid JSON."}') }
        }
        const headers = { ...req.headers }
        if (dev) {
          const id = devIdentity(req)
          if (id) { headers['x-acuitas-dev-user'] = id.name; headers['x-acuitas-dev-role'] = id.role }
        }
        const handle = await serviceFromEnv(env)
        const out = await handle({ method: req.method, url: req.url, headers, body })
        return send(res, out.status, out.headers, out.body)
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { 'content-type': 'text/plain' }, 'Method not allowed')
      return await serveStatic(req, res, url)
    } catch (e) {
      if (e.status === 413) return send(res, 413, { 'content-type': 'application/json' }, '{"error":"Request too large."}')
      console.error('acuitas server', e)
      return send(res, 500, { 'content-type': 'application/json' }, '{"error":"Server error."}')
    }
  })
}

// Run directly: node src/server.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8080)
  createServer().listen(port, () => console.log(`Acuitas listening on http://localhost:${port}${process.env.ACUITAS_BASE || '/'}`))
}
