import { test, expect } from '@playwright/test';
const { LoginPage } = require('../pages/login-page');
const { MainPage } = require('../pages/main-page' );
import { URLS, CREDENCIALES } from '../data/constantes';

test('Interactuar con la página principal', async ({ page }) => {
  await page.goto(URLS.SIDOMURL);

  const loginPage = new LoginPage(page);
  await loginPage.formLogin(CREDENCIALES.USER, CREDENCIALES.PASS);

  // Verifica que estamos en la página de inicio

 await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');;




  const mainPage = new MainPage(page);

  // Navegar a la página principal
  await mainPage.goToMainPage();
  await expect(page).toHaveURL('https://uat.sidom.io/index.php/carpeta/main?ipda=26633&ipie=MUESTRA23&despacho=23001IC04157582U');

  // Interactuar con los elementos de la página principal
  await mainPage.clickTipoOperacion();
  await mainPage.clickTopperArgentina();
  await mainPage.clickEE();
  await mainPage.clickInterno();
  await mainPage.clickOrigenImg();
  await mainPage.clickIcoAcuatico();
  await mainPage.clickDestinoImg();
  await mainPage.clickArribo();
  await mainPage.clickDespachante();
  await mainPage.clickNroDeclaracion();
  await mainPage.clickOficializado();
  await mainPage.clickAgenteTransporte();
  await mainPage.clickFOB();
  await mainPage.clickSeguro();
  await mainPage.clickFlete();
  await mainPage.clickLogistica();
  await mainPage.clickListaAgencias();
  await mainPage.clickBuscarAsociarAgencias();
  await mainPage.clickFirstAgency();
  await mainPage.clickOkButton();
  await mainPage.clickAccordionPSMDocs();
  await mainPage.clickPresupuestos();
  await mainPage.clickCostosOperativos();
  await mainPage.clickBeneficiario();
});
