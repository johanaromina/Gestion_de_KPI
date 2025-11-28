// pages/incoterms-page.js herramientas para usuarios 

class IncotermsPage {
    constructor(page) {
      this.page = page;
    }
  
    async clickEXW() {
      await this.page.locator('ul').filter({ hasText: 'EXW Franco fábrica. Ex works' }).getByRole('img').click();
    }
  
    async clickEXWText() {
      await this.page.getByText('EXW Franco fábrica. Ex works.').click();
    }
  
    async clickModalidad() {
      await this.page.getByText('Modalidad').click();
    }
  
    async clickMaritimo() {
      await this.page.getByText('Marítimo').first().click();
    }
  
    async clickElemento2_4() {
      await this.page.locator('ul:nth-child(2) > li:nth-child(4)').click();
    }
  
    async clickIndicadorImg() {
      await this.page.locator('li').filter({ hasText: 'Indicador' }).locator('img').click();
    }
  
    async clickElemento3_7() {
      await this.page.locator('ul:nth-child(3) > li:nth-child(7)').click();
    }
  
    async clickEmbalajeVerificacion() {
      await this.page.getByText('Embalaje verificación doc.').click();
    }
  
    async clickImgNth2() {
      await this.page.locator('li:nth-child(2) > img').first().click();
    }
  
    async clickImgNth3() {
      await this.page.locator('li:nth-child(3) > img').first().click();
    }
  
    async clickImgNth4() {
      await this.page.locator('li:nth-child(4) > img').first().click();
    }
  
    async clickCargaImg() {
      await this.page.locator('li').filter({ hasText: 'Carga' }).locator('img').click();
    }
  
    async clickTransporteInterior() {
      await this.page.getByText('Transporte interior').first().click();
    }
  
    async clickFormalidadesAduanerasExportacion() {
      await this.page.getByText('Formalidades aduaneras exportación').click();
    }
  
    async clickCostosManipulacionFirst() {
      await this.page.getByText('Costos manipulación').first().click();
    }
  
    async clickTransportePrincipal() {
      await this.page.getByText('Transporte principal').click();
    }
  
    async clickSeguros() {
      await this.page.getByText('Seguros').click();
    }
  
    async clickCostosManipulacionNth1() {
      await this.page.getByText('Costos manipulación').nth(1).click();
    }
  
    async clickFormalidadesAduanerasImportacion() {
      await this.page.getByText('Formalidades aduaneras importación').click();
    }
  
    async clickTransporteInteriorNth1() {
      await this.page.getByText('Transporte interior').nth(1).click();
    }
  
    async clickEntrega() {
      await this.page.getByText('Entrega', { exact: true }).click();
    }
  
    async clickDDP() {
      await this.page.getByText('DDP Entrega derechos pagados').click();
    }
  
    async clickElemento2_11() {
      await this.page.locator('ul:nth-child(2) > li:nth-child(11)').click();
    }
  
    async clickElemento3_11() {
      await this.page.locator('ul:nth-child(3) > li:nth-child(11)').click();
    }
  
    async clickElemento3_12() {
      await this.page.locator('ul:nth-child(3) > li:nth-child(12)').click();
    }
  
    async clickElemento14_12() {
      await this.page.locator('ul:nth-child(14) > li:nth-child(12) > img').click();
    }
  
    async clickElemento14First2Img() {
      await this.page.locator('ul:nth-child(14) > .first2 > img').click();
    }
  
    async clickEXWAgain() {
      await this.page.locator('ul').filter({ hasText: 'EXW Franco fábrica. Ex works' }).getByRole('img').click();
    }
  
    async clickModalidadImg() {
      await this.page.locator('li').filter({ hasText: 'Modalidad' }).locator('img').click();
    }
  }
  
  module.exports = { IncotermsPage };
  