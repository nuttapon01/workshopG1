import { defineConfig } from 'cypress';

/**
 * Cypress config for the PointHub QA automation suite (Test1 / QA unit).
 *
 * Target: a running PointHub server (Express + built React SPA) on http://localhost:3000
 * See README.md for the prerequisite startup sequence.
 */
export default defineConfig({
  e2e: {
    baseUrl: process.env.POINTHUB_BASE_URL || 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: 'cypress/fixtures',
    video: false,
    screenshotOnRunFailure: true,
    viewportWidth: 1440,
    viewportHeight: 900,
    defaultCommandTimeout: 8000,
    requestTimeout: 15000,
    responseTimeout: 20000,
    // One retry in headless runs absorbs antd animation flakiness without hiding real defects.
    retries: {
      runMode: 1,
      openMode: 0,
    },
  },
});
