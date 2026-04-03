import { Router, Request, Response } from 'express'
import { openApiSpec } from '../openapi/spec.js'

const router = Router()

/* GET /api/docs/openapi.json — raw OpenAPI 3.0 spec */
router.get('/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(openApiSpec)
})

/* GET /api/docs — Swagger UI (loaded from CDN, no extra deps) */
router.get('/', (_req: Request, res: Response) => {
  const specUrl = '/api/docs/openapi.json'
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KPI Manager — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { background: #111827; }
    .swagger-ui .topbar .wrapper { padding: 8px 20px; }
    .swagger-ui .topbar-wrapper img { display: none; }
    .swagger-ui .topbar-wrapper::after {
      content: 'KPI Manager API';
      color: #f97316;
      font-weight: 800;
      font-size: 20px;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${specUrl}',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
      tryItOutEnabled: true,
      requestInterceptor: (req) => {
        const token = localStorage.getItem('kpiManagerToken')
        if (token) req.headers['Authorization'] = 'Bearer ' + token
        return req
      },
    })
  </script>
</body>
</html>`
  res.send(html)
})

export default router
