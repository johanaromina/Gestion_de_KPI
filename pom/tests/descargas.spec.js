import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DescargasEmbarques } from '../pages/descargas-embarques-page';
import { URLS, CREDENCIALES } from '../data/constantes';

test('test6, DescargasEmbarques', async ({ page }) => {
    await page.goto(URLS.SIDOMURL);

    const loginPage = new LoginPage(page);
    await loginPage.formLogin(CREDENCIALES.USER, CREDENCIALES.PASS);

    // Verifica que estamos en la página de inicio
    await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');

    const descargasPage = new DescargasEmbarques(page);

    // Navegar a la página de home
    await descargasPage.gotoHome();

    await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');

   

    console.log('Navegado a la página de home');

    // Seleccionar perfil y buscar importador
    await descargasPage.selectProfile('29');
    await descargasPage.searchImporter('30500525327');
    await descargasPage.clickImporterCell('Topper Argentina Sa (');
    await descargasPage.clickButton('Ok');

    // Llenar rango de fechas
    await descargasPage.fillDateRange('19/09/2023', '19/09/2023');

    // Seleccionar tipos de obligación
    await descargasPage.searchObligations();

    // Realizar la búsqueda
    await descargasPage.clickSearch();

    // Descargar archivo de texto y validar
    const downloadPath = await descargasPage.downloadTextFile('odt'); // Cambia 'odt' al formato deseado
    await descargasPage.validateTextFile(downloadPath);
});

