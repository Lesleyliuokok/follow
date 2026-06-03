/**
 * HK Fetch Proxy
 *
 * Receives a JSON payload describing an HTTP request, performs it from
 * this server's Hong Kong IP, and streams the response back.
 *
 * POST /fetch
 * {
 *   "url": "https://...",
 *   "method": "GET",          // optional, default GET
 *   "headers": { ... },       // optional
 *   "body": "..."             // optional
 * }
 *
 * Protected by PROXY_SECRET env var (passed as Authorization: Bearer <secret>).
 */

const http = require('http')

const PORT = process.env.PORT || 8080
const SECRET = process.env.PROXY_SECRET || ''

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, region: process.env.FLY_REGION || 'unknown' }))
    return
  }

  if (req.method !== 'POST' || req.url !== '/fetch') {
    res.writeHead(404)
    res.end('Not Found')
    return
  }

  // Auth
  const auth = req.headers['authorization'] || ''
  if (SECRET && auth !== `Bearer ${SECRET}`) {
    res.writeHead(401)
    res.end('Unauthorized')
    return
  }

  // Parse body
  let body = ''
  for await (const chunk of req) body += chunk
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    res.writeHead(400)
    res.end('Bad JSON')
    return
  }

  const { url, method = 'GET', headers = {}, body: reqBody } = payload

  if (!url || typeof url !== 'string') {
    res.writeHead(400)
    res.end('Missing url')
    return
  }

  try {
    const upstream = await fetch(url, {
      method,
      headers,
      body: reqBody != null ? String(reqBody) : undefined,
    })

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const data = await upstream.arrayBuffer()

    res.writeHead(upstream.status, {
      'Content-Type': contentType,
      'X-Upstream-Status': String(upstream.status),
      'Access-Control-Allow-Origin': '*',
    })
    res.end(Buffer.from(data))
  } catch (err) {
    console.error('[proxy] fetch error:', err.message, 'url:', url)
    res.writeHead(502)
    res.end(JSON.stringify({ error: 'upstream_error', message: err.message }))
  }
})

server.listen(PORT, () => {
  console.log(`[proxy] listening on :${PORT} region=${process.env.FLY_REGION || 'local'}`)
})
