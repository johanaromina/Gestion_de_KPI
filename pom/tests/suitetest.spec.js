import { test, expect } from '@playwright/test';
const { LoginPage } = require('../pages/login-page');
import { URLS, CREDENCIALES } from '../data/constantes';

test('test1, login', async ({ page }) => {
  console.log('URL:', URLS.SIDOMURL);
  console.log('User:', CREDENCIALES.USER);
  console.log('Password:', CREDENCIALES.PASS);

  await page.goto(URLS.SIDOMURL);
  const loginPage = new LoginPage(page);
  await loginPage.formLogin(CREDENCIALES.USER, CREDENCIALES.PASS);

  // Verifica que estamos en la página de inventario

  await expect(page).toHaveURL('https://uat.sidom.io/index.php/home');;

});
