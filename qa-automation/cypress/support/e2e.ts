/// <reference types="cypress" />

import './commands';

/**
 * The CS UI is an internal tool with no error boundary around antd's message API.
 * Unhandled promise rejections from axios (expected in negative-path specs) must not
 * fail the test — the assertions cover the user-visible outcome instead.
 */
Cypress.on('uncaught:exception', (err) => {
  if (/Request failed with status code|Network Error/.test(err.message)) {
    return false;
  }
  return true;
});
