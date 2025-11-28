const { expect } = require('@playwright/test');

exports.LoginPage = class LoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.user = page.getByPlaceholder('Correo electrónico');
    this.pass = page.getByPlaceholder('Contraseña');
    this.loginButton = page.getByRole('button', { name: 'INGRESAR' });
  }

  async formLogin(user, pass) {
    console.log('Waiting for user field to be visible');
    await this.user.waitFor({ state: 'visible' });
    console.log('Filling user field with:', user);
    await this.user.fill(user);
    
    console.log('Waiting for password field to be visible');
    await this.pass.waitFor({ state: 'visible' });
    console.log('Filling password field with:', pass);
    await this.pass.fill(pass);
    
    console.log('Waiting for login button to be visible');
    await this.loginButton.waitFor({ state: 'visible' });
    console.log('Clicking login button');
    await this.loginButton.click();
  }
};

