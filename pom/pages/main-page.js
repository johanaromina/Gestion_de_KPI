const { expect } = require('@playwright/test');

exports.MainPage = class MainPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async goToMainPage() {
    await this.page.goto('https://uat.sidom.io/index.php/carpeta/main?ipda=26633&ipie=MUESTRA23&despacho=23001IC04157582U');
  }

  async clickTipoOperacion() {
    await this.page.getByText('Tipo de operación: Importación').click();
  }

  async clickTopperArgentina() {
    await this.page.getByText('(30500525327)TOPPER ARGENTINA').click();
  }

  async clickEE() {
    await this.page.locator('#ee').click();
  }

  async clickInterno() {
    await this.page.getByText('Interno: 26633').click();
  }

  async clickOrigenImg() {
    await this.page.locator('#origen_img').click();
  }

  async clickIcoAcuatico() {
    await this.page.locator('#ico_acuatico').click();
  }

  async clickDestinoImg() {
    await this.page.locator('#destino_img').click();
  }

  async clickArribo() {
    await this.page.getByText('Arribo: 10/08/').click();
  }

  async clickDespachante() {
    await this.page.getByText('Despachante:').click();
  }

  async clickNroDeclaracion() {
    await this.page.getByText('Nro. Declaración:').click();
  }

  async clickOficializado() {
    await this.page.getByText('Oficializado: 19/09/').click();
  }

  async clickAgenteTransporte() {
    await this.page.getByText('Agente de Transporte:').click();
  }

  async clickFOB() {
    await this.page.getByText('FOB: USD').click();
  }

  async clickSeguro() {
    await this.page.getByText('Seguro: USD').click();
  }

  async clickFlete() {
    await this.page.getByText('Flete: USD').click();
  }

  async clickLogistica() {
    await this.page.getByText('Logística').click();
  }

  async clickListaAgencias() {
    await this.page.locator('#lista_ag_aero_camion_btn i').click();
  }

  async clickBuscarAsociarAgencias() {
    await this.page.getByPlaceholder('Buscar y asociar Agencias,').click();
  }

  async clickFirstAgency() {
    await this.page.locator('tbody').filter({ hasText: 'CUIT Nombre CancelarOk' }).locator('td').first().click();
  }

  async clickOkButton() {
    await this.page.getByRole('button', { name: 'Ok' }).click();
  }

  async clickAccordionPSMDocs() {
    await this.page.locator('#h_accordion_psm_docs').click();
  }

  async clickPresupuestos() {
    await this.page.getByText('Presupuestos').click();
  }

  async clickExactPresupuestos() {
    await this.page.getByText('Presupuestos', { exact: true }).click();
  }

  async clickCostosOperativos() {
    await this.page.getByText('Costos operativos asociados').click();
  }

  async clickBeneficiario() {
    await this.page.locator('#beneficiario').click();
  }
};