import fs from 'fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Load .env and .env.local into process.env for local serverless simulation
for (const envFile of ['.env.local', '.env']) {
  const filePath = path.resolve(process.cwd(), envFile)
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim()
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
          if (!process.env[key]) {
            process.env[key] = val
          }
        }
      }
    }
  }
}

/**
 * Local development middleware for /api/* serverless functions.
 * In production, Vercel natively executes api/*.js as serverless endpoints.
 */
function apiDevPlugin() {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          const urlPath = req.url.split('?')[0]
          const endpoint = urlPath.replace('/api/', '')
          const handlerPath = path.resolve(process.cwd(), `api/${endpoint}.js`)

          // Dynamically sync process.env with .env.local on each local API call
          for (const envFile of ['.env.local', '.env']) {
            const envFilePath = path.resolve(process.cwd(), envFile)
            if (fs.existsSync(envFilePath)) {
              const lines = fs.readFileSync(envFilePath, 'utf-8').split('\n')
              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed && !trimmed.startsWith('#')) {
                  const eqIdx = trimmed.indexOf('=')
                  if (eqIdx !== -1) {
                    const key = trimmed.slice(0, eqIdx).trim()
                    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
                    process.env[key] = val
                  }
                }
              }
            }
          }

          if (fs.existsSync(handlerPath)) {
            try {
              const handlerModule = await server.ssrLoadModule(`./api/${endpoint}.js`)
              const handler = handlerModule.default

              if (typeof handler === 'function') {
                const parsedUrl = new URL(req.url, 'http://localhost')
                req.query = Object.fromEntries(parsedUrl.searchParams)

                const executeHandler = async (body) => {
                  req.body = body

                  // Augment response object with Express-like helpers used in Vercel
                  res.status = (code) => {
                    res.statusCode = code
                    return res
                  }

                  res.json = (data) => {
                    if (!res.headersSent) {
                      res.setHeader('Content-Type', 'application/json')
                    }
                    res.end(JSON.stringify(data))
                    return res
                  }

                  res.send = (text) => {
                    res.end(text)
                    return res
                  }

                  try {
                    await handler(req, res)
                  } catch (err) {
                    console.error(`Error in /api/${endpoint} handler:`, err)
                    if (!res.writableEnded) {
                      res.statusCode = 500
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify({ ok: false, error: err.message }))
                    }
                  }
                }

                if (req.method === 'GET' || req.method === 'HEAD') {
                  await executeHandler({})
                  return
                }

                let rawBody = ''
                req.on('data', (chunk) => {
                  rawBody += chunk
                })

                req.on('end', async () => {
                  let parsed = {}
                  if (rawBody) {
                    try {
                      parsed = JSON.parse(rawBody)
                    } catch {
                      parsed = rawBody
                    }
                  }
                  await executeHandler(parsed)
                })
                return
              }
            } catch (err) {
              console.error(`Error executing /api/${endpoint} in dev middleware:`, err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: err.message }))
              return
            }
          }
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevPlugin()],
})
