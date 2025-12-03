-- Script para insertar datos de ejemplo en la base de datos

USE gestion_kpi;

-- Insertar algunos colaboradores de ejemplo
INSERT INTO collaborators (name, position, area, role) VALUES
('Juan Pérez', 'CEO', 'Dirección General', 'admin'),
('María García', 'Director de Operaciones', 'Operaciones', 'director'),
('Carlos López', 'Gerente de Ventas', 'Ventas', 'manager'),
('Ana Martínez', 'Líder de Equipo', 'Ventas', 'leader'),
('Pedro Sánchez', 'Ejecutivo de Ventas', 'Ventas', 'collaborator')
ON DUPLICATE KEY UPDATE name=name;

-- Actualizar managerId después de insertar
UPDATE collaborators SET managerId = 1 WHERE id = 2; -- María reporta a Juan
UPDATE collaborators SET managerId = 2 WHERE id = 3; -- Carlos reporta a María
UPDATE collaborators SET managerId = 3 WHERE id = 4; -- Ana reporta a Carlos
UPDATE collaborators SET managerId = 4 WHERE id = 5; -- Pedro reporta a Ana

-- Insertar períodos de ejemplo
INSERT INTO periods (name, startDate, endDate, status) VALUES
('Q1 2024', '2024-01-01', '2024-03-31', 'closed'),
('Q2 2024', '2024-04-01', '2024-06-30', 'in_review'),
('Q3 2024', '2024-07-01', '2024-09-30', 'open')
ON DUPLICATE KEY UPDATE name=name;

-- Insertar subperíodos para Q1 2024
INSERT INTO sub_periods (periodId, name, startDate, endDate, weight) VALUES
(1, 'Enero 2024', '2024-01-01', '2024-01-31', 33.33),
(1, 'Febrero 2024', '2024-02-01', '2024-02-29', 33.33),
(1, 'Marzo 2024', '2024-03-01', '2024-03-31', 33.34)
ON DUPLICATE KEY UPDATE name=name;

-- Insertar KPIs de ejemplo
INSERT INTO kpis (name, description, type, criteria) VALUES
('Ventas Totales', 'Ventas totales del período', 'growth', 'Incremento del 10% respecto al período anterior'),
('Tasa de Conversión', 'Porcentaje de leads convertidos', 'growth', 'Aumento del 5%'),
('Tiempo de Respuesta', 'Tiempo promedio de respuesta a clientes', 'reduction', 'Reducción del 15%'),
('Satisfacción del Cliente', 'Score de satisfacción del cliente', 'exact', 'Mantener score de 4.5/5'),
('Costo por Adquisición', 'Costo de adquirir un nuevo cliente', 'reduction', 'Reducción del 20%')
ON DUPLICATE KEY UPDATE name=name;

