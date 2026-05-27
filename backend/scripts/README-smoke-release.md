`smoke-release.ts` valida una instancia candidata a release sin escribir datos.

Cobertura:
- shell frontend y rutas SPA
- assets i18n críticos
- health/ready
- login y `auth/me`
- catálogo base (`periods`, `kpis`, `objective-trees`, `scope-kpis`, `collaborator-kpis`)
- tablero ejecutivo y tendencias
- configuración/integraciones si el usuario tiene permisos
- exports OKR PDF/Excel

Uso:
```bash
cd backend
tsx scripts/smoke-release.ts https://app.example.com admin@empresa.demo Admin1234!
```

Alternativa con variables:
```bash
APP_URL=https://app.example.com
API_BASE_URL=https://api.example.com/api
SMOKE_EMAIL=admin@empresa.demo
SMOKE_PASSWORD=Admin1234!
tsx scripts/smoke-release.ts
```
