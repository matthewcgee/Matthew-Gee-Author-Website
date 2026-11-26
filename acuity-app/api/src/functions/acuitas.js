// Azure Functions entry point (Node.js v4 programming model). Deployed as the
// managed API of an Azure Static Web App, or as a standalone Function App
// behind the same sign-in. Every route under /api goes to the data service.

import { app } from '@azure/functions'
import { serviceFromEnv } from '../config.js'
import { MAX_BODY_BYTES } from '../core/service.js'

app.http('acuitas', {
  route: '{*path}',
  methods: ['GET', 'PUT', 'PATCH', 'DELETE', 'POST'],
  authLevel: 'anonymous', // sign-in is enforced by Static Web Apps in front of the API
  handler: async (request, context) => {
    let body
    const text = ['PUT', 'PATCH', 'POST'].includes(request.method) ? await request.text() : ''
    if (text.length > MAX_BODY_BYTES) return { status: 413, jsonBody: { error: 'Request too large.' } }
    if (text) {
      try { body = JSON.parse(text) } catch { return { status: 400, jsonBody: { error: 'The request body is not valid JSON.' } } }
    }
    try {
      const handle = await serviceFromEnv()
      const res = await handle({ method: request.method, url: request.url, headers: request.headers, body })
      return { status: res.status, headers: res.headers, body: res.body }
    } catch (e) {
      context.error('Acuitas data service could not start', e)
      return { status: 503, jsonBody: { error: 'The Acuitas data service is not configured. See api/README.md.' } }
    }
  },
})
