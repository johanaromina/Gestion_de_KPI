# Estado del Proyecto - Gestión de KPIs

Actualizado: 2026-05-27

## Estado General

El proyecto ya no está en fase de infraestructura o MVP inicial. La base del producto está operativa end-to-end, con backend, frontend, autenticación, módulos de gestión y reporting ejecutivo funcionando. La deuda principal dejó de ser "construir pantallas" y pasó a ser calidad operativa: pruebas, documentación y mantenimiento de convenciones.

Estado estimado actual:

- Producto funcional: alto
- Cobertura frontend principal: alta
- Cobertura backend principal: alta
- Internacionalización frontend visible: cerrada
- Deuda técnica residual: media-baja

## Completado

### Plataforma base

- Backend en Express + TypeScript con MySQL.
- Frontend en React + TypeScript + Vite.
- Autenticación con sesión/JWT y control de permisos por rol.
- Estructura de datos y APIs principales operativas.

### Módulos funcionales

- Gestión de colaboradores, áreas y jerarquías.
- Gestión de períodos y subperíodos.
- Gestión de KPIs y asignaciones.
- Mi Parrilla / seguimiento individual.
- Curaduría y flujo de revisión.
- Árbol de objetivos y vistas agregadas.
- Histórico, evolutivos y tableros ejecutivos.
- Auditoría, seguridad y configuración.
- Importación de datos y marketplace de templates.
- Exportación ejecutiva y narrativa automática.
- Integraciones operativas visibles en configuración y wizards.

### Internacionalización

- Frontend principal migrado a `es` / `en`.
- Layout, login, landing, formularios, modales y wizards internacionalizados.
- Utilidades narrativas/PDF ya no dependen de copy fijo en español.
- Marketplace importa KPIs en el idioma activo y evita duplicados entre idiomas.
- Plantillas CSV de importación y asunto de contacto de landing localizados.
- Normalización de errores API con `code` estable en controladores backend principales y secundarios.
- Eliminación del patrón `response.data.error` crudo en frontend.

## Cambios recientes

- Cierre del backlog visible de traducción inglés/español en frontend.
- Normalización del marketplace para importar texto localizado.
- Compleción de locales faltantes de marketplace en español.
- Localización de plantillas CSV en importación de áreas y colaboradores.
- Limpieza del fallback de contacto en landing.
- Migración de controladores backend restantes a `sendApiError` / códigos estables.
- Verificación de builds `backend` y `frontend` sin errores.

## Deuda actual

### Alta prioridad

- Actualizar y mantener esta documentación alineada con el código real.
- Mejorar cobertura de pruebas de regresión sobre flujos críticos.
- Definir una convención única para agregar nuevos códigos de error y locales asociados.

### Media prioridad

- Consolidar convenciones de fallback i18n en catálogos, seeds y mensajes internos.
- Agregar smoke tests o checks automatizados para auth, marketplace, importación y tablero ejecutivo.
- Seguir endureciendo validaciones tipadas en backend para reducir lógica repetida en controladores.

### Baja prioridad

- Seguir puliendo consistencia de textos internos no visibles al usuario.
- Reordenar documentación técnica por módulos en vez de por RF histórica.

## Riesgos / Observaciones

- El warning de Vite por tamaño de chunk principal quedó resuelto con lazy-loading y chunking manual; hoy el build no reporta esa alerta.
- Los controladores backend ya responden con `code` estable y el frontend no depende de `response.data.error` crudo.
- Había una brecha entre documentación y estado real del repo; este archivo reemplaza esa versión desactualizada.

## Próximos pasos recomendados

1. Agregar validaciones automáticas o smoke tests sobre flujos críticos:
   - marketplace
   - importación
   - tablero ejecutivo
   - exportación
2. Mantener la convención de `code` + traducción al agregar nuevos endpoints o validaciones.
3. Mantener esta documentación como snapshot ejecutivo, no como checklist histórico de MVP.

## Resumen ejecutivo

El proyecto está en una etapa madura de producto, no de arranque. La funcionalidad core está implementada, la internacionalización visible del frontend quedó cerrada y la normalización principal de errores API también. Lo que sigue ya no es construir el sistema base, sino endurecer calidad con pruebas, documentación y disciplina de mantenimiento.
