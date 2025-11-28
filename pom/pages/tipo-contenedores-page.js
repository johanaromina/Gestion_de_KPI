// pages/tipo-contenedores-page.js

class TipoContenedoresPage {
    constructor(page) {
      this.page = page;
    }
  
    async clickFlatRack40() {
      await this.page.locator('#generalcont div').filter({ hasText: "40' Flat Rack C 12,080 2,126" }).getByRole('img').click();
    }
  
    async clickElemento11() {
      await this.page.locator('div:nth-child(11) > .cont_table_wdg > ul:nth-child(2) > li:nth-child(6)').click();
    }
  
    async clickFlatRack20() {
      await this.page.locator('#generalcont div').filter({ hasText: "20' Flat Rack C 5,618 2,208 2" }).getByRole('img').click();
    }
  
    async clickElemento6() {
      await this.page.locator('div:nth-child(6) > .cont_table_wdg > ul:nth-child(2) > li:nth-child(5)').click();
    }
  
    async clickElemento3() {
      await this.page.locator('div:nth-child(6) > .cont_table_wdg > ul:nth-child(2) > li:nth-child(3)').click();
    }
  
    async click2208() {
      await this.page.getByText('2,208').click();
    }
  
    async clickOpenTop40() {
      await this.page.locator('#generalcont div').filter({ hasText: "40' Open Top 12,027 2,344 2," }).getByRole('img').click();
    }
  
    async clickElemento14_2() {
      await this.page.locator('div:nth-child(14) > .cont_table_wdg > ul:nth-child(2) > li:nth-child(2)').click();
    }
  
    async clickElemento14_3() {
      await this.page.locator('div:nth-child(14) > .cont_table_wdg > ul:nth-child(2) > li:nth-child(3)').click();
    }
  
    async clickElemento14_5() {
      await this.page.locator('div:nth-child(14) > .cont_table_wdg > ul:nth-child(2) > li:nth-child(5)').click();
    }
  
    async clickTextoOpenTop40() {
      await this.page.getByText("40' Open Top").click();
    }
  
    async clickTextoSeaContainers() {
      await this.page.getByText('SEA CONTAINERS | CONTENEDORES').click();
    }
  
    async clickFlatRack20B() {
      await this.page.locator("#generalcont div").filter({ hasText: "20' Flat Rack 5,460 2,240 2," }).getByRole("img").click();
    }
  
    async clickElemento2_5() {
      await this.page.locator('ul:nth-child(2) > li:nth-child(5)').first().click();
    }
  
    async clickElemento2_1() {
      await this.page.locator('ul:nth-child(2) > li').first().click();
    }
  
    async click5460() {
      await this.page.getByText('5,460').first().click();
    }
  
    async clickStandard20() {
      await this.page.locator("#generalcont div").filter({ hasText: "20' Standard 5,890 2,330 2," }).getByRole("img").click();
    }
  
    async clickFlatRack40B() {
      await this.page.locator("#generalcont div").filter({ hasText: "40' Flat Rack 11,550 2,250 2," }).getByRole("img").click();
    }
  
    async clickHTML() {
      await this.page.locator('html').click();
    }
  }
  
  module.exports = { TipoContenedoresPage };
  