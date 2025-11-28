import { test, expect } from '@playwright/test';
const { LoginPage } = require('../pages/login-page');
const { TipoContenedoresPage } = require('../pages/tipo-contenedores-page');
import { URLS, CREDENCIALES } from '../data/constantes';

test('test3, interact with tipo de contenedores', async ({ page }) => {
  await page.goto(URLS.SIDOMURL);

  const loginPage = new LoginPage(page);
  await loginPage.formLogin(CREDENCIALES.USER, CREDENCIALES.PASS);

  // Verifica que estamos en la página de inicio
  await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');

  // Navegar a la página de tipos de contenedores
  await page.goto('https://uat.sidom.io/index.php/common/show_tipo_contenedores');
  await expect(page).toHaveURL('https://uat.sidom.io/index.php/common/show_tipo_contenedores');

  const tipoContenedoresPage = new TipoContenedoresPage(page);

  // Realiza las acciones en la página de tipos de contenedores
  await tipoContenedoresPage.clickFlatRack40();
  await tipoContenedoresPage.clickElemento11();
  await tipoContenedoresPage.clickFlatRack20();
  await tipoContenedoresPage.clickElemento6();
  await tipoContenedoresPage.clickElemento3();
  await tipoContenedoresPage.click2208();
  await tipoContenedoresPage.clickOpenTop40();
  await tipoContenedoresPage.clickElemento14_2();
  await tipoContenedoresPage.clickElemento14_3();
  await tipoContenedoresPage.clickElemento14_5();
  await tipoContenedoresPage.clickTextoOpenTop40();
  await tipoContenedoresPage.clickTextoSeaContainers();
  await tipoContenedoresPage.clickFlatRack20B();
  await tipoContenedoresPage.clickElemento2_5();
  await tipoContenedoresPage.clickElemento2_1();
  await tipoContenedoresPage.click5460();
  await tipoContenedoresPage.clickStandard20();
  await tipoContenedoresPage.clickFlatRack40B();
  await tipoContenedoresPage.clickHTML();
});
