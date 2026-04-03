/**
 * OpenAPI 3.0 specification for KPI Manager API.
 * Served statically — no swagger-jsdoc dependency needed.
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'KPI Manager API',
    version: '1.0.0',
    description:
      'API para gestión de KPIs organizacionales, colaboradores, períodos, curaduria, check-ins y dashboards ejecutivos. Autenticación via Bearer JWT.',
    contact: {
      name: 'KPI Manager',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API base path',
    },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT obtenido desde POST /auth/login',
      },
    },
    schemas: {
      /* ── Auth ─────────────────────────────────────────── */
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@empresa.com' },
          password: { type: 'string', example: 'secreto123' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT Bearer token' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'director', 'manager', 'leader', 'collaborator'] },
          orgScopeId: { type: 'integer', nullable: true },
        },
      },
      /* ── Collaborator ─────────────────────────────────── */
      Collaborator: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          position: { type: 'string' },
          area: { type: 'string' },
          orgScopeId: { type: 'integer', nullable: true },
          email: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['admin', 'director', 'manager', 'leader', 'collaborator'] },
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      },
      /* ── Period ───────────────────────────────────────── */
      Period: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string', example: 'Q1 2025' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          status: { type: 'string', enum: ['open', 'in_review', 'closed'] },
        },
      },
      SubPeriod: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          periodId: { type: 'integer' },
          name: { type: 'string', example: 'Enero 2025' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          status: { type: 'string', enum: ['open', 'closed'] },
          weight: { type: 'number', nullable: true },
        },
      },
      /* ── KPI ──────────────────────────────────────────── */
      KPI: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string', enum: ['manual', 'count', 'ratio', 'sla', 'value'] },
          direction: { type: 'string', enum: ['growth', 'reduction', 'exact'], nullable: true },
          criteria: { type: 'string' },
          formula: { type: 'string', nullable: true },
        },
      },
      /* ── CollaboratorKPI ──────────────────────────────── */
      CollaboratorKPI: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          collaboratorId: { type: 'integer' },
          kpiId: { type: 'integer' },
          periodId: { type: 'integer' },
          target: { type: 'number' },
          actual: { type: 'number', nullable: true },
          weight: { type: 'number' },
          variation: { type: 'number', nullable: true },
          weightedResult: { type: 'number', nullable: true },
          status: { type: 'string', enum: ['draft', 'proposed', 'approved', 'closed'] },
          collaboratorName: { type: 'string' },
          kpiName: { type: 'string' },
          periodName: { type: 'string' },
        },
      },
      /* ── ScopeKPI ─────────────────────────────────────── */
      ScopeKPI: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          kpiId: { type: 'integer' },
          orgScopeId: { type: 'integer' },
          periodId: { type: 'integer' },
          target: { type: 'number' },
          actual: { type: 'number', nullable: true },
          weight: { type: 'number' },
          variation: { type: 'number', nullable: true },
          status: { type: 'string', enum: ['draft', 'proposed', 'approved', 'closed'] },
          orgScopeName: { type: 'string' },
        },
      },
      /* ── OrgScope ─────────────────────────────────────── */
      OrgScope: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['company', 'area', 'team', 'business_unit', 'person', 'product'] },
          parentId: { type: 'integer', nullable: true },
          active: { type: 'boolean' },
        },
      },
      /* ── CheckIn ──────────────────────────────────────── */
      CheckIn: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          collaboratorId: { type: 'integer' },
          collaboratorName: { type: 'string' },
          weekStart: { type: 'string', format: 'date', description: 'Lunes de la semana' },
          q1: { type: 'string', description: '¿Cómo avanzaste esta semana respecto a tus KPIs?' },
          q2: { type: 'string', description: '¿Qué obstáculos encontraste?' },
          q3: { type: 'string', description: '¿Cuál es tu foco para la próxima semana?' },
          mood: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
          kpiName: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      /* ── Dashboard ────────────────────────────────────── */
      ExecutiveTreeResponse: {
        type: 'object',
        properties: {
          periodId: { type: 'integer', nullable: true },
          periodName: { type: 'string', nullable: true },
          subPeriodId: { type: 'integer', nullable: true },
          companies: {
            type: 'array',
            items: { $ref: '#/components/schemas/ExecutiveTreeNode' },
          },
        },
      },
      ExecutiveTreeNode: {
        type: 'object',
        properties: {
          scope: { $ref: '#/components/schemas/OrgScope' },
          summary: {
            type: 'object',
            properties: {
              totalScopeKpis: { type: 'integer' },
              approvedScopeKpis: { type: 'integer' },
              completionRate: { type: 'number' },
              averageVariation: { type: 'number', nullable: true },
              weightedResultTotal: { type: 'number' },
            },
          },
          objectives: { type: 'array', items: { type: 'string' } },
          scopeKpis: { type: 'array', items: { $ref: '#/components/schemas/ScopeKPI' } },
          children: { type: 'array', items: { $ref: '#/components/schemas/ExecutiveTreeNode' } },
        },
      },
      /* ── Errors ───────────────────────────────────────── */
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
    },
  },
  paths: {
    /* ── Auth ─────────────────────────────────────────── */
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        description: 'Obtiene un JWT Bearer token. Incluirlo en el header `Authorization: Bearer <token>` en todas las requests.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: { description: 'Login exitoso', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          401: { description: 'Credenciales inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Obtener usuario autenticado',
        responses: {
          200: { description: 'Usuario actual', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          401: { description: 'No autenticado' },
        },
      },
    },
    /* ── Collaborators ────────────────────────────────── */
    '/collaborators': {
      get: {
        tags: ['Colaboradores'],
        summary: 'Listar colaboradores',
        parameters: [
          { name: 'orgScopeId', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
        ],
        responses: {
          200: { description: 'Lista de colaboradores', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Collaborator' } } } } },
        },
      },
    },
    '/collaborators/{id}': {
      get: {
        tags: ['Colaboradores'],
        summary: 'Obtener colaborador por ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Colaborador', content: { 'application/json': { schema: { $ref: '#/components/schemas/Collaborator' } } } },
          404: { description: 'No encontrado' },
        },
      },
    },
    /* ── Periods ──────────────────────────────────────── */
    '/periods': {
      get: {
        tags: ['Períodos'],
        summary: 'Listar períodos',
        responses: {
          200: { description: 'Períodos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Period' } } } } },
        },
      },
    },
    '/periods/{periodId}/sub-periods': {
      get: {
        tags: ['Períodos'],
        summary: 'Listar subperíodos de un período',
        parameters: [{ name: 'periodId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Subperíodos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SubPeriod' } } } } },
        },
      },
    },
    /* ── KPIs ─────────────────────────────────────────── */
    '/kpis': {
      get: {
        tags: ['KPIs'],
        summary: 'Listar KPIs',
        responses: {
          200: { description: 'KPIs', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/KPI' } } } } },
        },
      },
    },
    '/kpis/{id}': {
      get: {
        tags: ['KPIs'],
        summary: 'Obtener KPI por ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'KPI', content: { 'application/json': { schema: { $ref: '#/components/schemas/KPI' } } } },
          404: { description: 'No encontrado' },
        },
      },
    },
    /* ── CollaboratorKPIs ─────────────────────────────── */
    '/collaborator-kpis': {
      get: {
        tags: ['Asignaciones'],
        summary: 'Listar todas las asignaciones KPI',
        description: 'Retorna todas las asignaciones colaborador-KPI-período. Útil para integración con Power BI / Tableau.',
        parameters: [
          { name: 'periodId', in: 'query', schema: { type: 'integer' } },
          { name: 'collaboratorId', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'proposed', 'approved', 'closed'] } },
        ],
        responses: {
          200: { description: 'Asignaciones', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CollaboratorKPI' } } } } },
        },
      },
    },
    '/collaborator-kpis/collaborator/{collaboratorId}': {
      get: {
        tags: ['Asignaciones'],
        summary: 'Asignaciones de un colaborador (todos los períodos)',
        parameters: [{ name: 'collaboratorId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Asignaciones del colaborador', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CollaboratorKPI' } } } } },
        },
      },
    },
    '/collaborator-kpis/collaborator/{collaboratorId}/consolidated': {
      get: {
        tags: ['Asignaciones'],
        summary: 'Consolidado de resultado por colaborador',
        parameters: [{ name: 'collaboratorId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Consolidado por período' },
        },
      },
    },
    '/collaborator-kpis/{id}/propose': {
      post: {
        tags: ['Asignaciones'],
        summary: 'Proponer valor para una asignación',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  actual: { type: 'number' },
                  comments: { type: 'string' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Valor propuesto' },
          400: { description: 'Error de validación' },
        },
      },
    },
    '/collaborator-kpis/{id}/approve': {
      post: {
        tags: ['Asignaciones'],
        summary: 'Aprobar una asignación (líderes+)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Aprobado' } },
      },
    },
    /* ── ScopeKPIs ────────────────────────────────────── */
    '/scope-kpis': {
      get: {
        tags: ['KPIs Grupales'],
        summary: 'Listar KPIs organizacionales',
        parameters: [
          { name: 'periodId', in: 'query', schema: { type: 'integer' } },
          { name: 'orgScopeId', in: 'query', schema: { type: 'integer' } },
          { name: 'subPeriodId', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'KPIs grupales', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ScopeKPI' } } } } },
        },
      },
    },
    /* ── Dashboard ────────────────────────────────────── */
    '/dashboard/executive-tree': {
      get: {
        tags: ['Dashboard'],
        summary: 'Árbol ejecutivo con KPIs por área',
        description: 'Retorna la jerarquía organizacional completa (company → area → team) con KPIs grupales, variaciones y resúmenes. Es el endpoint principal para integración con herramientas BI.',
        parameters: [
          { name: 'periodId', in: 'query', schema: { type: 'integer' }, description: 'Si se omite, usa el período activo con más datos' },
          { name: 'subPeriodId', in: 'query', schema: { type: 'integer' } },
          { name: 'scopeId', in: 'query', schema: { type: 'integer' }, description: 'Filtrar por empresa/scope raíz' },
        ],
        responses: {
          200: { description: 'Árbol ejecutivo', content: { 'application/json': { schema: { $ref: '#/components/schemas/ExecutiveTreeResponse' } } } },
        },
      },
    },
    '/dashboard/executive-trends': {
      get: {
        tags: ['Dashboard'],
        summary: 'Tendencias históricas por scope',
        parameters: [
          { name: 'scopeId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'periodId', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Series de tendencia por período y subperíodo' },
        },
      },
    },
    '/dashboard/stats': {
      get: {
        tags: ['Dashboard'],
        summary: 'Estadísticas generales del período activo',
        responses: {
          200: { description: 'Stats globales' },
        },
      },
    },
    /* ── OrgScopes ────────────────────────────────────── */
    '/org-scopes': {
      get: {
        tags: ['Estructura organizacional'],
        summary: 'Listar unidades organizacionales',
        responses: {
          200: { description: 'Scopes', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/OrgScope' } } } } },
        },
      },
    },
    /* ── Check-ins ────────────────────────────────────── */
    '/check-ins': {
      get: {
        tags: ['Check-ins'],
        summary: 'Listar check-ins',
        description: 'Colaboradores ven solo los propios. Líderes y admins ven los del equipo.',
        parameters: [
          { name: 'collaboratorId', in: 'query', schema: { type: 'integer' } },
          { name: 'weekStart', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha mínima (lunes de semana)' },
          { name: 'weekEnd', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Check-ins', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CheckIn' } } } } },
        },
      },
      post: {
        tags: ['Check-ins'],
        summary: 'Crear / actualizar check-in de la semana actual',
        description: 'Upsert: si ya existe uno para la semana, lo actualiza.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['q1', 'q2', 'q3'],
                properties: {
                  q1: { type: 'string' },
                  q2: { type: 'string' },
                  q3: { type: 'string' },
                  mood: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
                  collaboratorKpiId: { type: 'integer', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Check-in guardado', content: { 'application/json': { schema: { $ref: '#/components/schemas/CheckIn' } } } },
          400: { description: 'Faltan campos requeridos' },
        },
      },
    },
    '/check-ins/current-week': {
      get: {
        tags: ['Check-ins'],
        summary: 'Check-in del usuario autenticado para la semana actual',
        responses: {
          200: { description: 'Check-in o null si no existe', content: { 'application/json': { schema: { nullable: true, oneOf: [{ $ref: '#/components/schemas/CheckIn' }, { type: 'null' }] } } } },
        },
      },
    },
    '/check-ins/team-summary': {
      get: {
        tags: ['Check-ins'],
        summary: 'Resumen semanal del equipo (líderes+)',
        parameters: [{ name: 'weeks', in: 'query', schema: { type: 'integer', default: 8 } }],
        responses: {
          200: { description: 'Participación y mood promedio por semana' },
        },
      },
    },
  },
}
