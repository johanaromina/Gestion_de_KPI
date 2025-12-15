# Guía: Importar Plan y Generar Parrillas Base

Esta guía explica cómo cargar el alcance mensual de cada colaborador usando los targets y ponderaciones del plan.

## Proceso Completo

### Paso 1: Importar el Plan desde Excel

Primero, importa el plan de KPIs desde el archivo Excel a la tabla `collaborator_kpi_plan`:

```bash
cd backend
npm run import:plan "OKR KPI Total v0.xlsx" <periodId> "KPI Equipo Producto "
```

**Parámetros:**
- `"OKR KPI Total v0.xlsx"`: Ruta al archivo Excel (puede estar en la raíz del proyecto)
- `<periodId>`: ID del período en la base de datos (ej: 1, 2, 3...)
- `"KPI Equipo Producto "`: Nombre exacto de la hoja del Excel (opcional, por defecto: "KPI Equipo Producto ")

**Ejemplo:**
```bash
npm run import:plan "OKR KPI Total v0.xlsx" 1 "KPI Equipo Producto "
```

**Requisitos previos:**
- ✅ Los subperíodos en la DB deben tener `startDate` en formato YYYY-MM-DD (ej: 2025-03-01, 2025-04-01)
- ✅ Los nombres de colaboradores y KPIs en la DB deben coincidir exactamente con los del Excel
- ✅ El archivo Excel debe tener columnas de fechas en la cabecera (formato serial de Excel)

**Qué hace este script:**
- Lee el archivo Excel y extrae targets mensuales por colaborador/KPI
- Guarda el plan en la tabla `collaborator_kpi_plan` con:
  - `target`: Target mensual del Excel
  - `weight`: Peso del KPI (se toma de la columna 7 del Excel)
  - `subPeriodId`: ID del subperíodo que coincide con la fecha

### Paso 2: Generar Parrillas Base

Una vez importado el plan, genera las parrillas base usando la API. Esto crea las asignaciones mensuales con targets y ponderaciones ya precargados.

**Endpoint:**
```
POST /api/collaborator-kpis/generate-base-grids
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**
```json
{
  "area": "Producto",
  "periodId": 1,
  "kpiIds": [1, 2, 3]  // Opcional: si no se especifica, usa todos los KPIs
}
```

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:5000/api/collaborator-kpis/generate-base-grids \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <tu-token>" \
  -d '{
    "area": "Producto",
    "periodId": 1
  }'
```

**Ejemplo con JavaScript/Fetch:**
```javascript
const response = await fetch('http://localhost:5000/api/collaborator-kpis/generate-base-grids', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    area: 'Producto',
    periodId: 1,
    kpiIds: [1, 2, 3]  // Opcional
  })
});

const result = await response.json();
console.log(result);
```

**Qué hace este endpoint:**
1. Busca colaboradores del área especificada
2. Busca KPIs (todos o los especificados en `kpiIds`)
3. **Si existe plan** en `collaborator_kpi_plan`:
   - Crea una asignación por cada subperíodo del plan
   - Usa el `target` del plan para cada mes
   - **Distribuye el peso** entre los subperíodos para no inflar el total (>100%)
     - Ejemplo: Si un KPI tiene peso 35% y hay 12 subperíodos, cada uno recibe 35% / 12 = 2.92%
4. **Si no existe plan**:
   - Crea asignación única sin subperíodo (comportamiento anterior)
   - Distribuye peso equitativamente entre KPIs

**Respuesta exitosa:**
```json
{
  "message": "Parrillas base generadas correctamente",
  "created": 120,
  "errors": 0,
  "details": {
    "area": "Producto",
    "periodId": 1,
    "collaboratorsCount": 10,
    "kpisCount": 4,
    "assignments": [
      {
        "id": 1,
        "collaboratorId": 1,
        "kpiId": 1,
        "periodId": 1,
        "subPeriodId": 1,
        "target": 100,
        "weight": 2.92
      },
      // ... más asignaciones
    ]
  }
}
```

## Flujo Completo de Ejemplo

```bash
# 1. Importar el plan
cd backend
npm run import:plan "OKR KPI Total v0.xlsx" 1 "KPI Equipo Producto "

# 2. Generar parrillas base (usando la API)
# Opción A: Desde el frontend o Postman
POST /api/collaborator-kpis/generate-base-grids
{
  "area": "Producto",
  "periodId": 1
}

# Opción B: Desde cURL
curl -X POST http://localhost:5000/api/collaborator-kpis/generate-base-grids \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"area": "Producto", "periodId": 1}'
```

## Notas Importantes

1. **Distribución de Pesos:**
   - Los pesos se distribuyen automáticamente entre los subperíodos
   - Esto evita que la suma de pesos supere el 100%
   - Si un KPI tiene peso 35% y hay 12 meses, cada mes recibe 35% / 12 = 2.92%

2. **Targets:**
   - Los targets se toman tal cual vienen del Excel
   - Cada subperíodo tiene su propio target del plan

3. **Alcances Reales:**
   - Los "alcances" reales del Excel NO se importan (solo el plan)
   - Los alcances se registran después a través de la aplicación

4. **Matching de Datos:**
   - Los nombres de colaboradores y KPIs deben coincidir exactamente
   - Los que no hacen match se omiten silenciosamente

5. **Subperíodos:**
   - Los subperíodos deben tener `startDate` que coincida con las fechas del Excel
   - Formato requerido: YYYY-MM-DD (ej: 2025-03-01, 2025-04-01)

## Solución de Problemas

### Error: "No se encontró el archivo"
- Verifica que el archivo Excel esté en la raíz del proyecto o proporciona la ruta completa
- El script busca automáticamente en la raíz si no encuentra el archivo en la ruta relativa

### Error: "No se encontró subperiodo con startDate"
- Verifica que los subperíodos en la DB tengan `startDate` en formato YYYY-MM-DD
- Las fechas deben coincidir exactamente con las del Excel

### No se crean asignaciones
- Verifica que exista plan en `collaborator_kpi_plan` para el área/período
- Verifica que los nombres de colaboradores y KPIs coincidan exactamente

### Los pesos suman más de 100%
- Esto no debería pasar porque los pesos se distribuyen automáticamente
- Si ocurre, verifica que el plan tenga el peso correcto en el Excel

