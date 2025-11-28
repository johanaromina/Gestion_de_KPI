// @ts-check
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config(); // Habilita la lectura de variables de entorno

module.exports = defineConfig({
  testDir: './pom/tests', // Cambiado a './tests' para que coincida con el directorio de tus pruebas
  fullyParallel: true, // Manteniendo la ejecución de pruebas en paralelo
  forbidOnly: !!process.env.CI, // Manteniendo la configuración para CI
  retries: process.env.CI ? 2 : 0, // Manteniendo la configuración para CI
  workers: process.env.CI ? 1 : undefined, // Manteniendo la configuración para CI
  reporter: 'html', // Manteniendo el reportero HTML

  use: {
    baseURL: process.env.SIDOMURL || 'http://localhost:3000', // Manteniendo el URL base
    trace: 'on-first-retry', // Manteniendo la recolección de trazas
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});

