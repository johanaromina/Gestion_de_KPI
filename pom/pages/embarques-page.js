const path = require('path');
const fs = require('fs');
const { expect } = require('@playwright/test');
const ExcelJS = require('exceljs');

exports.EmbarquesPage = class EmbarquesPage {
  constructor(page) {
    this.page = page;
  }

  async gotoHome() {
    await this.page.goto('https://uat.sidom.io/index.php/home');
  }

  async selectProfile(profileId) {
    await this.page.waitForSelector('#selectPerfilesGen');
    await this.page.selectOption('#selectPerfilesGen', profileId);
}
  async searchImporter(importerId) {
    await this.page.getByPlaceholder('Importadores - Exportadores').click();
    await this.page.getByTitle('Buscar Importadores/').locator('i').click();
    await this.page.getByPlaceholder('Importadores - Exportadores').click();
    await this.page.waitForSelector('#pd_data_iesg');
    await this.page.locator('#pd_data_iesg').selectOption(importerId);
    console.log(`Importer ${importerId} searched`);
  }

  async clickImporterCell(text) {
    await this.page.getByRole('cell', { name: text }).locator('i').click();
  }

  async clickButton(buttonText) {
    await this.page.getByRole('button', { name: buttonText }).click();
  }

  async fillDateRange(startDate, endDate) {
    await this.page.waitForSelector('#idesde');
    await this.page.fill('#idesde', startDate);
    await this.page.waitForSelector('#ihasta');
    await this.page.fill('#ihasta', endDate);
  }

  async searchObligations() {
    await this.page.getByRole('button', { name: 'Tipos de obligación:' }).click();
    await this.page.getByRole('link', { name: ' Todos' }).click();
  }

  async clickSearch() {
    await this.page.getByRole('button', { name: 'Buscar' }).click();
    console.log('Busqueda iniciada');
  }

  async verifyColumnsAfterSearch() {
    try {
      console.log('Esperando a que la tabla esté presente en el DOM...');
      const table = this.page.locator('//table');

      console.log('Verificando la visibilidad de la tabla...');
      await expect(table).toBeVisible({ timeout: 30000 });

      console.log('Obteniendo cabeceras de la tabla...');
      const columnHeaders = await table.locator('//th').allTextContents();

      const cleanedHeaders = columnHeaders.map(header => header.replace(/[\n\t]/g, '').replace('▲ ▼', '').trim());
      console.log('Cleaned Headers:', cleanedHeaders);

      const expectedHeaders = [
        'Interno',
        'Referencia',
        'Nro. destinación',
        'Fecha de embarque',
        'Fecha de arribo',
        'Alta carpeta',
        'Fecha Oficialización',
        'Fecha de Carga-Salida',
        'Fecha de digitalizado',
        'Aduana',
        'Aduana Destino/Salida',
        'Pais de procedencia',
        'Incoterm',
        'B.I.',
        'Dólar',
        'Total Pagado',
        'Total Garantizado',
        'Total Factoria',
        'Valores',
        'Reintegro',
        'Medio de transporte',
        'Tipo de embalaje',
        'Transportista',
        'Cantidad de bultos',
        'Cantidad de embalajes'
      ];

      const headersAreEqual = JSON.stringify(cleanedHeaders) === JSON.stringify(expectedHeaders);
      console.log('Las cabeceras son iguales:', headersAreEqual);
      expect(headersAreEqual).toBeTruthy();
    } catch (error) {
      console.error('Error al verificar las cabeceras de la tabla:', error);
      throw error;
    }
  }

  async downloadExcel() {
    // Hacer clic en el botón "Exportar a Excel"
    const exportButton = this.page.getByRole('button', { name: 'Exportar a Excel' });
    await exportButton.click();

    // Esperar a que el campo para el nombre del archivo esté visible
    const fileNameInput = this.page.locator('input[placeholder="Nombre del archivo."]');
    await fileNameInput.waitFor({ state: 'visible', timeout: 30000 });

    // Ingresar el nombre del archivo
    await fileNameInput.fill('TestCabecera');

    // Iniciar la descarga del archivo Excel
    const [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: 60000 }),
        this.page.getByRole('button', { name: 'Ejecutar ahora' }).click()
    ]);

    const downloadDir = path.join(__dirname, '../descargas');
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir);
    }

    const downloadPath = path.join(downloadDir, 'TestCabecera.xlsx');
    await download.saveAs(downloadPath);
    console.log(`Archivo descargado y guardado en: ${downloadPath}`);

    return downloadPath;
  }

  async validateExcel(downloadPath) {
    const fileStat = fs.statSync(downloadPath);
    if (fileStat.size === 0) {
        throw new Error(`El archivo descargado está vacío: ${downloadPath}`);
    }

    if (fileStat.size < 1024) {
        console.warn(`El archivo descargado puede estar corrupto o no tener datos: ${downloadPath}`);
    }

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(downloadPath);
        const worksheet = workbook.getWorksheet(1);

        if (!worksheet) {
            throw new Error('No se pudo encontrar la hoja de trabajo en el archivo Excel.');
        }

        const headerRow = worksheet.getRow(1);
        const fileHeaders = headerRow.values.slice(1);
        console.log('Cabeceras del archivo Excel:', fileHeaders);

        const expectedHeaders = [
          'Interno',
          'Referencia',
          'Nro. destinación',
          'Fecha de embarque',
          'Fecha de arribo',
          'Alta carpeta',
          'Fecha Oficialización',
          'Fecha de Carga-Salida',
          'Fecha de digitalizado',
          'Aduana',
          'Aduana Destino/Salida',
          'Pais de procedencia',
          'Incoterm',
          'B.I.',
          'Dólar',
          'Total Pagado',
          'Total Garantizado',
          'Total Factoria',
          'Valores',
          'Reintegro',
          'Medio de transporte',
          'Tipo de embalaje',
          'Transportista',
          'Cantidad de bultos',
          'Cantidad de embalajes'
        ];

        const headersAreEqual = JSON.stringify(fileHeaders) === JSON.stringify(expectedHeaders);
        console.log('Las cabeceras son iguales:', headersAreEqual);
        expect(headersAreEqual).toBeTruthy();
    } catch (error) {
        console.error(`Error al leer el archivo Excel: ${error.message}`);
        const fileContent = fs.readFileSync(downloadPath, 'utf8');
        console.log(`Contenido del archivo descargado: ${fileContent}`);
        throw new Error(`No se pudo leer el archivo Excel: ${downloadPath}`);
    }
  }
};
