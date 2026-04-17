-- ==========================================================
-- Escenario demo completo: OKR + KR + KPI integrado
-- Ajustado para base "prueba" de Vero (maderera el galpon)
-- ==========================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Limpiar intentos anteriores fallidos
DELETE FROM okr_check_ins WHERE keyResultId IN (
  SELECT id FROM okr_key_results WHERE objectiveId IN (
    SELECT id FROM okr_objectives WHERE title IN (
      'Escalar el negocio con eficiencia operativa',
      'Mejorar la calidad de entrega del producto',
      'Fortalecer el equipo para sostener el crecimiento'
    )
  )
);
DELETE FROM okr_key_results WHERE objectiveId IN (
  SELECT id FROM okr_objectives WHERE title IN (
    'Escalar el negocio con eficiencia operativa',
    'Mejorar la calidad de entrega del producto',
    'Fortalecer el equipo para sostener el crecimiento'
  )
);
DELETE FROM okr_objectives WHERE title IN (
  'Escalar el negocio con eficiencia operativa',
  'Mejorar la calidad de entrega del producto',
  'Fortalecer el equipo para sostener el crecimiento'
);

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================
-- IDs de esta base (maderera el galpon)
-- ==========================================================
SET @periodId    = 1;                 -- 20260101-20260331
SET @scopeEmpresa  = 1;              -- maderera el galpon (company)
SET @scopeVentas   = 7;              -- DIRECCION COMERCIAL
SET @scopeQA       = 17;             -- Quality Assurance
SET @scopeRRHH     = 4;              -- DIRECCION RRHH

SET @ownerAdmin    = 1;              -- Admin Prueba (admin)
SET @ownerCEO      = 4;              -- JUAN CEO (director)
SET @ownerVentas   = 16;             -- Lucas Lider Ventas (leader)
SET @ownerQA       = 25;             -- Joha Lider QA (leader)
SET @ownerRRHH     = 12;             -- Juana Lider Factura (leader)

-- collaborator_kpis vinculados
SET @kpiVentas     = 8;              -- Ingresos por Ventas Totales → Lucas Lider Ventas
SET @kpiNPS        = 14;             -- NPS Clientes → Admin Prueba

-- ==========================================================
-- OBJETIVO 1 (Empresa): Escalar el negocio
-- ==========================================================
INSERT INTO okr_objectives (title, parentId, orgScopeId, periodId, ownerId, status, progress)
VALUES (
  'Escalar el negocio con eficiencia operativa',
  NULL, @scopeEmpresa, @periodId, @ownerCEO, 'active', 68.00
);
SET @obj1 = LAST_INSERT_ID();

-- KR 1.1 — vinculado a KPI Ingresos por Ventas (kpi_linked)
INSERT INTO okr_key_results (objectiveId, title, krType, collaboratorKpiId, weight, ownerId, status, sortOrder)
VALUES (
  @obj1,
  'Ingresos por ventas ≥ $250.000 mensuales',
  'kpi_linked', @kpiVentas, 1.5, @ownerVentas, 'on_track', 1
);
SET @kr1_1 = LAST_INSERT_ID();

-- KR 1.2 — simple
INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj1,
  'Cerrar 3 nuevos clientes enterprise',
  'simple', 0, 3, 1, 'clientes', 1.0, @ownerVentas, 'at_risk', 2
);
SET @kr1_2 = LAST_INSERT_ID();

-- KR 1.3 — vinculado a KPI NPS (kpi_linked)
INSERT INTO okr_key_results (objectiveId, title, krType, collaboratorKpiId, weight, ownerId, status, sortOrder)
VALUES (
  @obj1,
  'NPS de clientes activos > 60',
  'kpi_linked', @kpiNPS, 1.0, @ownerAdmin, 'on_track', 3
);
SET @kr1_3 = LAST_INSERT_ID();

-- ==========================================================
-- OBJETIVO 2 (hijo de obj1): Calidad del producto
-- ==========================================================
INSERT INTO okr_objectives (title, parentId, orgScopeId, periodId, ownerId, status, progress)
VALUES (
  'Mejorar la calidad de entrega del producto',
  @obj1, @scopeQA, @periodId, @ownerQA, 'active', 52.00
);
SET @obj2 = LAST_INSERT_ID();

-- KR 2.1 — simple
INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj2,
  'Bug rate en producción < 5%',
  'simple', 12, 5, 7, '%', 1.0, @ownerQA, 'at_risk', 1
);
SET @kr2_1 = LAST_INSERT_ID();

-- KR 2.2 — simple
INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj2,
  'Cobertura de tests automatizados ≥ 85%',
  'simple', 60, 85, 78, '%', 1.0, @ownerQA, 'on_track', 2
);
SET @kr2_2 = LAST_INSERT_ID();

-- KR 2.3 — simple
INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj2,
  'US entregadas acumuladas ≥ 80 en el período',
  'simple', 0, 80, 61, 'historias', 1.0, @ownerQA, 'on_track', 3
);
SET @kr2_3 = LAST_INSERT_ID();

-- ==========================================================
-- OBJETIVO 3 (hijo de obj1): Equipo y talento
-- ==========================================================
INSERT INTO okr_objectives (title, parentId, orgScopeId, periodId, ownerId, status, progress)
VALUES (
  'Fortalecer el equipo para sostener el crecimiento',
  @obj1, @scopeRRHH, @periodId, @ownerRRHH, 'active', 60.00
);
SET @obj3 = LAST_INSERT_ID();

-- KR 3.1 — simple
INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj3,
  'eNPS del equipo > 50',
  'simple', 30, 50, 42, 'puntos', 1.0, @ownerRRHH, 'at_risk', 1
);
SET @kr3_1 = LAST_INSERT_ID();

-- KR 3.2 — simple
INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj3,
  'Retención de talento ≥ 90% en el período',
  'simple', 85, 90, 91, '%', 1.0, @ownerRRHH, 'completed', 2
);
SET @kr3_2 = LAST_INSERT_ID();

-- KR 3.3 — simple
INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
VALUES (
  @obj3,
  'Capacitar al 100% del equipo en herramientas nuevas',
  'simple', 0, 100, 65, '%', 1.0, @ownerRRHH, 'on_track', 3
);
SET @kr3_3 = LAST_INSERT_ID();

-- ==========================================================
-- CHECK-INS con historial realista
-- ==========================================================

-- KR 1.2: Clientes enterprise
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr1_2, 0, 'Arrancamos el trimestre sin cierres confirmados. Hay 4 deals en pipeline calificado.', @ownerVentas, DATE_SUB(NOW(), INTERVAL 6 WEEK)),
(@kr1_2, 1, 'Cerramos el primer cliente enterprise. Dos más en etapa de propuesta.', @ownerVentas, DATE_SUB(NOW(), INTERVAL 3 WEEK)),
(@kr1_2, 1, 'Los deals se extendieron. Foco en acortar el ciclo de venta esta semana.', @ownerVentas, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 2.1: Bug rate
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr2_1, 12, 'Bug rate inicial: 12%. Mayor fuente: regresiones en módulo de reportes.', @ownerQA, DATE_SUB(NOW(), INTERVAL 7 WEEK)),
(@kr2_1, 9,  'Implementamos suite de regresión. Bug rate bajó a 9%.', @ownerQA, DATE_SUB(NOW(), INTERVAL 4 WEEK)),
(@kr2_1, 7,  'Bug rate: 7%. La meta de 5% requiere completar los tests de integración.', @ownerQA, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 2.2: Test coverage
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr2_2, 60, 'Cobertura base: 60%. Plan: sumar 5pp por sprint hasta llegar a 85%.', @ownerQA, DATE_SUB(NOW(), INTERVAL 8 WEEK)),
(@kr2_2, 70, 'Sprint 1 y 2 completados. Cobertura: 70%.', @ownerQA, DATE_SUB(NOW(), INTERVAL 4 WEEK)),
(@kr2_2, 78, 'Cobertura: 78%. En camino. Módulo de pagos al 65%.', @ownerQA, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 2.3: US entregadas
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr2_3, 18, 'Primer mes: 18 historias entregadas. Ritmo por debajo del esperado.', @ownerQA, DATE_SUB(NOW(), INTERVAL 6 WEEK)),
(@kr2_3, 40, 'Mes 2: 40 acumuladas. Mejoramos el proceso de refinamiento.', @ownerQA, DATE_SUB(NOW(), INTERVAL 3 WEEK)),
(@kr2_3, 61, 'Mes 3: 61 acumuladas. En camino para superar las 80 al cierre.', @ownerQA, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 3.1: eNPS
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr3_1, 30, 'eNPS inicial: 30. Principales frenos: claridad en expectativas y falta de feedback.', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 8 WEEK)),
(@kr3_1, 38, 'Implementamos 1:1s semanales. eNPS subió a 38.', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 4 WEEK)),
(@kr3_1, 42, 'eNPS: 42. Mejora sostenida. Meta de 50 requiere resolver desarrollo de carrera.', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- KR 3.2: Retención
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr3_2, 85, 'Retención inicial: 85%. Una salida voluntaria en el período anterior.', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 6 WEEK)),
(@kr3_2, 91, 'Sin salidas en el período. Retención: 91%. KR completado ✓', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 2 WEEK));

-- KR 3.3: Capacitación
INSERT INTO okr_check_ins (keyResultId, value, note, authorId, createdAt) VALUES
(@kr3_3, 20, 'Capacitación iniciada. 20% del equipo completó el primer módulo.', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 6 WEEK)),
(@kr3_3, 45, '45% capacitado. Segundo módulo en curso, buena adhesión.', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 3 WEEK)),
(@kr3_3, 65, '65% del equipo capacitado. Último módulo programado para las próximas 2 semanas.', @ownerRRHH, DATE_SUB(NOW(), INTERVAL 1 WEEK));

-- ==========================================================
SELECT '✅ Escenario demo OKR completo cargado.' AS resultado;
SELECT CONCAT('OBJ empresa: ', title, ' (id=', id, ')') AS info FROM okr_objectives WHERE id = @obj1;
SELECT CONCAT('OBJ calidad:  ', title, ' (id=', id, ')') AS info FROM okr_objectives WHERE id = @obj2;
SELECT CONCAT('OBJ equipo:   ', title, ' (id=', id, ')') AS info FROM okr_objectives WHERE id = @obj3;
SELECT COUNT(*) AS total_krs FROM okr_key_results WHERE objectiveId IN (@obj1, @obj2, @obj3);
SELECT COUNT(*) AS total_checkins FROM okr_check_ins WHERE keyResultId IN (@kr1_2, @kr2_1, @kr2_2, @kr2_3, @kr3_1, @kr3_2, @kr3_3);
