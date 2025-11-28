import { test, expect } from '@playwright/test';
const { LoginPage } = require('../pages/login-page');
const { IncotermsPage } = require('../pages/incoterms-page');
import { URLS, CREDENCIALES } from '../data/constantes';

test('test4, interact with incoterms', async ({ page }) => {
  await page.goto(URLS.SIDOMURL);

  const loginPage = new LoginPage(page);
  await loginPage.formLogin(CREDENCIALES.USER, CREDENCIALES.PASS);

  // Verifica que estamos en la página de inicio

 await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');

 


  // Navegar a la página de incoterms
  await page.goto('https://uat.sidom.io/index.php/common/show_incoterms');
  await expect(page).toHaveURL('https://uat.sidom.io/index.php/common/show_incoterms');

  const incotermsPage = new IncotermsPage(page);

  // Realiza las acciones en la página de incoterms
  await incotermsPage.clickEXW();
  await incotermsPage.clickEXWText();
  await incotermsPage.clickModalidad();
  await incotermsPage.clickMaritimo();
  await incotermsPage.clickElemento2_4();
  await incotermsPage.clickIndicadorImg();
  await incotermsPage.clickElemento3_7();
  await incotermsPage.clickEmbalajeVerificacion();
  await incotermsPage.clickImgNth2();
  await incotermsPage.clickImgNth3();
  await incotermsPage.clickImgNth4();
  await incotermsPage.clickCargaImg();
  await incotermsPage.clickTransporteInterior();
  await incotermsPage.clickFormalidadesAduanerasExportacion();
  await incotermsPage.clickCostosManipulacionFirst();
  await incotermsPage.clickTransportePrincipal();
  await incotermsPage.clickSeguros();
  await incotermsPage.clickCostosManipulacionNth1();
  await incotermsPage.clickFormalidadesAduanerasImportacion();
  await incotermsPage.clickTransporteInteriorNth1();
  await incotermsPage.clickEntrega();
  await incotermsPage.clickDDP();
  await incotermsPage.clickElemento2_11();
  await incotermsPage.clickElemento3_11();
  await incotermsPage.clickElemento3_12();
  await incotermsPage.clickElemento14_12();
  await incotermsPage.clickElemento14First2Img();
  await incotermsPage.clickEXWAgain();
  await incotermsPage.clickModalidadImg();
});
