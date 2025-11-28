import { test, expect } from '@playwright/test';
const { LoginPage } = require('../pages/login-page');
const { PasosFronterizosPage } = require('../pages/pasos-fronterizos-page');
import { URLS, CREDENCIALES } from '../data/constantes';

test('Interactuar con la página de pasos fronterizos', async ({ page }) => {
 await page.goto(URLS.SIDOMURL);
 const loginPage = new LoginPage(page);
 await loginPage.formLogin(CREDENCIALES.USER, CREDENCIALES.PASS);
  
  // Verifica que estamos en la página de inicio
  await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');


  // Navegar a la página de incoterms
  await page.goto('https://uat.sidom.io/index.php/core/batch/show_pasos_fronterizos?popup=true');
  await expect(page).toHaveURL('https://uat.sidom.io/index.php/core/batch/show_pasos_fronterizos?popup=true');

  const pasosFronterizosPage = new PasosFronterizosPage(page);
  
  // Interactuar con los pasos fronterizos
  await pasosFronterizosPage.clickText('Actualmente 55 Pasos');
  await pasosFronterizosPage.clickHeader('Paso');
  await pasosFronterizosPage.clickHeader('Provincia');
  await pasosFronterizosPage.clickHeader('País');
  await pasosFronterizosPage.clickHeader('Estado');
  await pasosFronterizosPage.clickHeader('Notas');
  await pasosFronterizosPage.selectBorder('Agua Negra');
  await pasosFronterizosPage.selectProvince('San Juan');
  await pasosFronterizosPage.clickOnRow('Agua Negra San Juan Chile');
  await pasosFronterizosPage.selectClosureReason('CIERRE TRANSITORIO POR: HORARIO DE ATENCIÓN PASO INTERNACIONAL CERRADO');
  await pasosFronterizosPage.selectBorder('Aurora - Pratos');
  await pasosFronterizosPage.selectProvince('Misiones');
  await pasosFronterizosPage.selectCountry('Brasil');
  await pasosFronterizosPage.selectClosureReason('CIERRE TRANSITORIO POR: HORARIO DE ATENCIÓN');
  await pasosFronterizosPage.clickOnRow('Agua Negra San Juan Chile CERRADO CIERRE');
  await pasosFronterizosPage.clickText('Fecha de actualización 13/07/');
  await pasosFronterizosPage.selectBorder('Vuriloche');
  await pasosFronterizosPage.selectProvince('Rio Negro');
  await pasosFronterizosPage.clickOnRow('Vuriloche Rio Negro Chile');
});
