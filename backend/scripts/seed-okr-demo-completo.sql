-- ==========================================================
-- Escenario demo completo: OKR + KR + KPI integrado
-- Requiere: datos demo base ya cargados (seed-demo-examples.ts)
-- Ejecutar: desde MySQL contra la base demo / prueba
-- ==========================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Limpiar solo OKRs y check-ins anteriores del demo
DELETE FROM okr_check_ins
  WHERE keyResultId IN (SELECT id FROM okr_key_results WHERE objectiveId IN (
    SELECT id FROM okr_objectives WHERE title LIKE '%Demo%' OR title LIKE '%Escalar%' OR title LIKE '%Calidad%' OR title LIKE '%Equipo%'
  ));
DELETE FROM okr_key_results WHERE objectiveId IN (
  SELECT id FROM okr_objectives WHERE title LIKE '%Demo%' OR title LIKE '%Escalar%' OR title LIKE '%Calidad%' OR title LIKE '%Equipo%'
);
DELETE FROM okr_objectives
  WHERE title LIKE '%Demo%' OR title LIKE '%Escalar%' OR title LIKE '%Calidad%' OR title LIKE '%Equipo%';

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================
-- Variables de referencia (IDs por nombre)
-- ==========================================================

-- Periodo activo
SET @periodId = (SELECT id FROM periods WHERE name LIKE '%Demo%' LIMIT 1);

-- Subperiodo más reciente del periodo demo
SET @subPeriodId = (
  SELECT cs.id FROM calendar_subperiods cs
  JOIN calendar_profiles cp ON cp.id = cs.calendarProfileId
  WHERE cp.name LIKE '%Mensual%'
    AND cs.startDate <= CURDATE()
  ORDER BY cs.startDate DESC
  LIMIT 1
);

-- Colaboradores
SET @ownerAdmin   = (SELECT id FROM collaborators WHERE email LIKE 'admin@%' LIMIT 1);
SET @ownerAlexis  = (SELECT id FROM collaborators WHERE name LIKE '%Alexis%' LIMIT 1);
SET @ownerPedro   = (SELECT id FROM collaborators WHERE name LIKE '%Pedro%' LIMIT 1);
SET @ownerAle     = (SELECT id FROM collaborators WHERE name LIKE '%Ale de Haro%' LIMIT 1);
SET @ownerAndrea  = (SELECT id FROM collaborators WHERE name LIKE '%Andrea%' LIMIT 1);

-- Org scopes
SET @scopeCompany  = (SELECT id FROM org_scopes WHERE type = 'company' LIMIT 1);
SET @scopeRevenue  = (SELECT id FROM org_scopes WHERE name = 'Revenue' LIMIT 1);
SET @scopeQA       = (SELECT id FROM org_scopes WHERE name = 'QA' LIMIT 1);
SET @scopeCS       = (SELECT id FROM org_scopes WHERE name = 'Customer Success' LIMIT 1);

-- KPIs de colaboradores (kpi_linked)
SET @kpiRevenue = (
  SELECT ck.id FROM collaborator_kpis ck
  JOIN kpis k ON k.id = ck.kpiId
  WHERE k.name LIKE '%Ventas%' OR k.name LIKE '%Revenue%' OR k.name LIKE '%Ingreso%'
  ORDER BY ck.id DESC LIMIT 1
);

SET @kpiStories = (
  SELECT ck.id FROM collaborator_kpis ck
  JOIN kpis k ON k.id = ck.kpiId
  WHERE k.name LIKE '%US Entregadas%' OR k.name LIKE '%Histor%' OR k.name LIKE '%Entrega%'
  ORDER BY ck.id DESC LIMIT 1
);

SET @kpiQuality = (
  SELECT ck.id FROM collaborator_kpis ck
  JOIN kpis k ON k.id = ck.kpiId
  WHERE k.name LIKE '%Calidad%' OR k.name LIKE '%Quality%'
  ORDER BY ck.id DESC LIMIT 1
);

-- ==========================================================
-- OBJETIVO 1 (Empresa): Escalar el negocio con eficiencia
-- ==========================================================
INSERT INTO okr_objectives (title, description, parentId, orgScopeId, periodId, ownerId, status, progress)
VALUES (
  'Escalar el negocio con eficiencia operativa',
  'Crecer revenue mientras mantenemos calidad de entrega y satisfacción del cliente por encima del benchmark.',
  NULL,
  @scopeCompany,
  @periodId,
  @ownerAdmin,
  'active',
  68.00
);
SET @obj1 = LAST_INSERT_ID();

-- KR 1.1 — vinculado a KPI de revenue (kpi_linked)
INSERT INTO okr_key_results (objectiveId, title, description, krType, collaboratorKpiId, weight, ownerId, status, sortOrder)
VALUES (
  @obj1,
  'Ingresos por ventas ≥ $250.000 mensuales',
  'Medido directamente desde el KPI de ventas del equipo comercial.',
  'kpi_linked',
  @kpiRevenue,
  1.5,
  @ownerAlexis,
  'on_track',
  1
);
SET @kr1_1 = LAST_INSERT_ID();

-- KR 1.2 — simple, con check-ins
INSERT INTO okr_key_results (objectiveId, title, description, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj1,
  'Cerrar 3 nuevos clientes enterprise',
  'Contratos firmados con empresas de más de 200 empleados.',
  'simple',
  0, 3, 1,
  'clientes',
  1.0,
  @ownerAlexis,
  'at_risk',
  2
);
SET @kr1_2 = LAST_INSERT_ID();

-- KR 1.3 — simple, con check-ins
INSERT INTO okr_key_results (objectiveId, title, description, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj1,
  'NPS de clientes activos > 60',
  'Encuesta NPS trimestral a todos los clientes activos.',
  'simple',
  45, 60, 55,
  'puntos',
  1.0,
  @ownerAndrea,
  'on_track',
  3
);
SET @kr1_3 = LAST_INSERT_ID();

-- ==========================================================
-- OBJETIVO 2 (Área - hijo de obj1): Calidad del producto
-- ==========================================================
INSERT INTO okr_objectives (title, description, parentId, orgScopeId, periodId, ownerId, status, progress)
VALUES (
  'Mejorar la calidad de entrega del producto',
  'Reducir defectos en producción y aumentar la cobertura de tests para sostener el crecimiento con estabilidad.',
  @obj1,
  @scopeQA,
  @periodId,
  @ownerPedro,
  'active',
  52.00
);
SET @obj2 = LAST_INSERT_ID();

-- KR 2.1 — vinculado a KPI de historias (kpi_linked)
INSERT INTO okr_key_results (objectiveId, title, description, krType, collaboratorKpiId, weight, ownerId, status, sortOrder)
VALUES (
  @obj2,
  'US entregadas acumuladas ≥ 80 en el período',
  'Medido desde el motor KPI de entrega del equipo QA.',
  'kpi_linked',
  @kpiStories,
  1.0,
  @ownerPedro,
  'on_track',
  1
);
SET @kr2_1 = LAST_INSERT_ID();

-- KR 2.2 — simple
INSERT INTO okr_key_results (objectiveId, title, description, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj2,
  'Bug rate en producción < 5%',
  'Ratio de tickets críticos sobre total de deploys en el período.',
  'simple',
  12, 5, 7,
  '%',
  1.0,
  @ownerPedro,
  'at_risk',
  2
);
SET @kr2_2 = LAST_INSERT_ID();

-- KR 2.3 — simple
INSERT INTO okr_key_results (objectiveId, title, description, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj2,
  'Cobertura de tests automatizados ≥ 85%',
  'Cobertura medida sobre el código de producción en el repositorio principal.',
  'simple',
  60, 85, 78,
  '%',
  1.0,
  @ownerPedro,
  'on_track',
  3
);
SET @kr2_3 = LAST_INSERT_ID();

-- ==========================================================
-- OBJETIVO 3 (Área - hijo de obj1): Equipo y talento
-- ==========================================================
INSERT INTO okr_objectives (title, description, parentId, orgScopeId, periodId, ownerId, status, progress)
VALUES (
  'Fortalecer el equipo para sostener el crecimiento',
  'Clima laboral, retención y capacidades del equipo como palanca de escalabilidad.',
  @obj1,
  @scopeCS,
  @periodId,
  @ownerAndrea,
  'active',
  45.00
);
SET @obj3 = LAST_INSERT_ID();

-- KR 3.1 — simple
INSERT INTO okr_key_results (objectiveId, title, description, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj3,
  'eNPS del equipo > 50',
  'Encuesta interna de clima laboral aplicada trimestralmente.',
  'simple',
  30, 50, 42,
  'puntos',
  1.0,
  @ownerAndrea,
  'at_risk',
  1
);
SET @kr3_1 = LAST_INSERT_ID();

-- KR 3.2 — simple
INSERT INTO okr_key_results (objectiveId, title, description, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj3,
  'Retención de talento ≥ 90% en el período',
  'Porcentaje de colaboradores que permanecen vs. inicio del período.',
  'simple',
  85, 90, 91,
  '%',
  1.0,
  @ownerAndrea,
  'completed',
  2
);
SET @kr3_2 = LAST_INSERT_ID();

-- KR 3.3 — vinculado a KPI de calidad (kpi_linked)
INSERT INTO okr_key_results (objectiveId, title, description, krType, collaboratorKpiId, weight, ownerId, status, sortOrder)
VALUES (
  @obj3,
  'Calidad de gestión del equipo ≥ 75%',
  'Medido desde el KPI de calidad de gestión asignado al área.',
  'kpi_linked',
  @kpiQuality,
  1.0,
  @ownerAndrea,
  'on_track',
  3
);
SET @kr3_3 = LAST_INSERT_ID();

-- ==========================================================
-- CHECK-INS para KRs simples (historial de avance)
-- ==========================================================

-- KR 1.2: Clientes enterprise
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr1_2, 0, 'Arrancamos el trimestre sin cierres confirmados. Hay 4 deals en pipeline calificado.', @ownerAlexis, DATE_SUB(NOW(), INTERVAL 6 WEEK)),
(@kr1_2, 1, 'Cerramos el primer cliente enterprise: Grupo Versa (320 empleados). Dos más en etapa de propuesta.', @ownerAlexis, DATE_SUB(NOW(), INTERVAL 3 WEEK)),
(@kr1_2, 1, 'Los dos deals que estaban en propuesta se extendieron. Foco en acortar el ciclo de venta.', @ownerAlexis, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 1.3: NPS
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr1_3, 45, 'NPS inicial del período: 45. Principal detractor: tiempo de onboarding.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 8 WEEK)),
(@kr1_3, 52, 'Mejoramos el onboarding. NPS subió a 52. Detractores bajaron 3 puntos.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 4 WEEK)),
(@kr1_3, 55, 'NPS actual: 55. Estamos en camino pero necesitamos acelerar para llegar a 60 al cierre.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 2.2: Bug rate
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr2_2, 12, 'Bug rate inicial: 12%. Mayor fuente: regresiones en módulo de reportes.', @ownerPedro, DATE_SUB(NOW(), INTERVAL 7 WEEK)),
(@kr2_2, 9,  'Implementamos suite de regresión para reportes. Bug rate bajó a 9%.', @ownerPedro, DATE_SUB(NOW(), INTERVAL 4 WEEK)),
(@kr2_2, 7,  'Bug rate: 7%. Seguimos mejorando pero la meta de 5% requiere completar los tests de integración.', @ownerPedro, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 2.3: Test coverage
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr2_3, 60, 'Cobertura base: 60%. Plan: sumar 5pp por sprint hasta llegar a 85%.', @ownerPedro, DATE_SUB(NOW(), INTERVAL 8 WEEK)),
(@kr2_3, 70, 'Sprint 1 y 2 completados. Cobertura: 70%. El módulo de pagos es el más crítico pendiente.', @ownerPedro, DATE_SUB(NOW(), INTERVAL 4 WEEK)),
(@kr2_3, 78, 'Cobertura: 78%. En camino. Módulo de pagos al 65%, integraciones al 82%.', @ownerPedro, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 3.1: eNPS
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr3_1, 30, 'eNPS inicial: 30. Principales frenos: claridad en expectativas y falta de feedback estructurado.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 8 WEEK)),
(@kr3_1, 38, 'Implementamos 1:1s semanales y revisamos el proceso de feedback. eNPS subió a 38.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 4 WEEK)),
(@kr3_1, 42, 'eNPS: 42. Mejora sostenida pero la meta de 50 requiere resolver el tema de desarrollo de carrera.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 3.2: Retención
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr3_2, 85, 'Retención inicial: 85%. Una salida voluntaria en el período anterior.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 6 WEEK)),
(@kr3_2, 91, 'Sin salidas en el período. Retención: 91%. KR completado.', @ownerAndrea, DATE_SUB(NOW(), INTERVAL 2 WEEK));

-- ==========================================================
-- Actualizar progress en objetivos según KRs
-- (Cálculo aproximado para que el dashboard muestre bien)
-- ==========================================================

-- Obj2: Bug rate (1/5→80%), stories kpi_linked (on_track→75%), coverage (78/85→92%) → avg ~75% pero at_risk baja → ~52%
UPDATE okr_objectives SET progress = 52.00 WHERE id = @obj2;

-- Obj3: eNPS (42/50→84%), retención (91/90→100% completed), calidad kpi_linked → avg ~68% pero at_risk baja → ~45%
UPDATE okr_objectives SET progress = 60.00 WHERE id = @obj3;

-- Obj1 (empresa): hijos en 52% y 60% + sus KRs propios: NPS 55/60=92%, clientes 1/3=33% → ~68%
UPDATE okr_objectives SET progress = 68.00 WHERE id = @obj1;

-- ==========================================================
SELECT '✅ Escenario demo OKR completo cargado.' AS resultado;
SELECT CONCAT('Objetivo empresa: ', title, ' (id=', id, ')') AS info FROM okr_objectives WHERE id = @obj1;
SELECT CONCAT('Objetivo calidad: ', title, ' (id=', id, ')') AS info FROM okr_objectives WHERE id = @obj2;
SELECT CONCAT('Objetivo equipo:  ', title, ' (id=', id, ')') AS info FROM okr_objectives WHERE id = @obj3;
SELECT COUNT(*) AS total_krs FROM okr_key_results WHERE objectiveId IN (@obj1, @obj2, @obj3);
SELECT COUNT(*) AS total_checkins FROM okr_check_ins WHERE keyResultId IN (@kr1_2, @kr1_3, @kr2_2, @kr2_3, @kr3_1, @kr3_2);
