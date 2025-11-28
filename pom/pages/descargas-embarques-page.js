const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const { expect } = require('@playwright/test');

exports.DescargasEmbarques = class DescargasEmbarques {
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

    async downloadTextFile(format) {
        const exportButton = this.page.getByRole('button', { name: 'Exportar a Excel' });
        await exportButton.click();

        const fileNameInput = this.page.locator('input[placeholder="Nombre del archivo."]');
        await fileNameInput.waitFor({ state: 'visible', timeout: 30000 });

        await fileNameInput.fill('TestCabecera');

        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 80000 }),
            this.page.getByRole('button', { name: 'EJECUTAR AHORA' }).click()
        ]);

        const downloadDir = path.join(__dirname, '../descargas');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir);
        }

        const downloadPath = path.join(downloadDir, `TestCabecera.${format}`);
        await download.saveAs(downloadPath);
        console.log(`Archivo descargado y guardado en: ${downloadPath}`);

        return downloadPath;
    }

    async validateTextFile(downloadPath) {
        // Leer el archivo con la codificación correcta (ISO-8859-1)
        const fileContent = iconv.decode(fs.readFileSync(downloadPath), 'ISO-8859-1');
        console.log(`Contenido completo del archivo descargado:\n${fileContent}`);

        const expectedHeaders = [
            'INTERNO',
            'REFERENCIA',
            'Destinación',
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
            'Cantidad de embalajes',
            '\r'
        ];

        // Leer las cabeceras del archivo descargado
        const fileHeaders = fileContent.split('\n')[0].split('\t');
        console.log('Cabeceras del archivo descargado:', fileHeaders);
        console.log('Cabeceras esperadas:', expectedHeaders);

        const headersAreEqual = JSON.stringify(fileHeaders) === JSON.stringify(expectedHeaders);
        console.log('Las cabeceras son iguales:', headersAreEqual);

        // Imprimir diferencias entre cabeceras si no coinciden
        if (!headersAreEqual) {
            for (let i = 0; i < Math.max(fileHeaders.length, expectedHeaders.length); i++) {
                if (fileHeaders[i] !== expectedHeaders[i]) {
                    console.log(`Diferencia en la posición ${i}: esperado "${expectedHeaders[i]}", recibido "${fileHeaders[i]}"`);
                }
            }
        }

        expect(headersAreEqual).toBeTruthy();
    }
};
