// pages\pasos-fronterizos-page.js

const { expect } = require('@playwright/test');

exports.PasosFronterizosPage = class PasosFronterizosPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async goToPasosFronterizosPage() {
    await this.page.goto('https://uat.sidom.io/index.php/core/batch/show_pasos_fronterizos?popup=true');
  }

  async clickText(text) {
    await this.page.waitForSelector(`text=${text}`);
    await this.page.click(`text=${text}`);
  }

  async clickHeader(header) {
    await this.page.click(`th:has-text("${header}")`);
  }

  async selectBorder(border) {
    await this.page.click(`td:has-text("${border}")`);
  }

  async selectProvince(province) {
    await this.page.click(`td:has-text("${province}")`);
  }

  async selectCountry(country) {
    await this.page.click(`td:has-text("${country}")`);
  }

  async selectClosureReason(reason) {
    await this.page.click(`td:has-text("${reason}")`);
  }

  async clickOnRow(rowText) {
    await this.page.click(`tr:has-text("${rowText}")`);
  }
};