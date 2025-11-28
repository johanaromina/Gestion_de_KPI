import { test, expect } from '@playwright/test';
const { LoginPage } = require('../pages/login-page');
const { EmbarquesPage } = require('../pages/embarques-page');
import { URLS, CREDENCIALES } from '../data/constantes';


test('test5, Embarques', async ({ page }) => {  
  
  await page.goto(URLS.SIDOMURL);

  const loginPage = new LoginPage(page);
  await loginPage.formLogin(CREDENCIALES.USER, CREDENCIALES.PASS);

  // Verifica que estamos en la página de inicio
  await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');
  const embarquesPage = new EmbarquesPage(page);

  // Navegar a la página de home
  await embarquesPage.gotoHome();

  await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');

 
  console.log('Navegado a la página de home');

  // Seleccionar perfil y buscar importador
  await embarquesPage.selectProfile('29');
  await embarquesPage.searchImporter('30500525327');
  await embarquesPage.clickImporterCell('Topper Argentina Sa (');
  await embarquesPage.clickButton('Ok');

  // Llenar rango de fechas
  await embarquesPage.fillDateRange('19/09/2021', '19/09/2023');

  // Seleccionar tipos de obligación
  await embarquesPage.searchObligations();

  // Realizar la búsqueda
  await embarquesPage.clickSearch();

  // Verificar las cabeceras de la tabla
  await embarquesPage.verifyColumnsAfterSearch();
 


}, { timeout: 160000 });
