# Instalación de Dependencias para Exportación

Para habilitar la funcionalidad de exportación (RF-18), es necesario instalar las siguientes dependencias en el backend:

## Dependencias requeridas

```bash
npm install pdfkit exceljs
npm install --save-dev @types/pdfkit
```

## Descripción de las dependencias

- **pdfkit**: Librería para generar documentos PDF
- **exceljs**: Librería para generar archivos Excel (.xlsx)
- **@types/pdfkit**: Tipos TypeScript para pdfkit

## Verificación

Después de instalar las dependencias, reinicia el servidor backend:

```bash
npm run dev
```

Los endpoints de exportación estarán disponibles en:
- `GET /api/export/parrilla/:collaboratorId/:periodId/pdf`
- `GET /api/export/parrilla/:collaboratorId/:periodId/excel`

