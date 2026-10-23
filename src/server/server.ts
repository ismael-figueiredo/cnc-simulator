import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'

// Browser mode: serves the built UI (npm run build) and the API.
// Runs on any OS with Node, no Electron needed.
const PORT = Number(process.env['PORT'] ?? 5174)
const HOST = process.env['HOST'] ?? '127.0.0.1'
const UI_DIR = resolve('out/renderer')

async function start() {
  const app = Fastify({ logger: { level: 'info' } })

  app.get('/api/health', () => ({ ok: true, version: process.env['npm_package_version'] ?? 'dev' }))

  if (existsSync(UI_DIR)) {
    await app.register(fastifyStatic, { root: UI_DIR })
  } else {
    app.get('/', async (_req, reply) =>
      reply.type('text/plain; charset=utf-8').send('UI not built yet. Run "npm run build" and restart the server.')
    )
  }

  await app.listen({ port: PORT, host: HOST })
}

start().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
