/// <reference types="cypress" />

import { sel, reasonLabels, type ReasonCode } from './selectors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Opens the CS UI and waits for the lookup card to be interactive. */
      openCsUi(): Chainable<void>;

      /** Types a member id into the search box and submits it. */
      lookupMember(memberId: string): Chainable<void>;

      /** Reads the balance shown in the Member Information card as a number. */
      uiBalance(): Chainable<number>;

      /** Fills and submits the Manual Adjustment form. */
      submitAdjustment(
        points: number,
        reason: ReasonCode,
        description?: string
      ): Chainable<void>;

      /** Asserts an antd message notice containing `text` is visible. */
      expectMessage(text: string | RegExp): Chainable<void>;
    }
  }
}

Cypress.Commands.add('openCsUi', () => {
  cy.visit('/');
  cy.get(sel.searchInput, { timeout: 15000 }).should('be.visible');
});

Cypress.Commands.add('lookupMember', (memberId: string) => {
  cy.get(sel.searchInput).clear().type(memberId);
  cy.get(sel.searchButton).click();
});

Cypress.Commands.add('uiBalance', () => {
  return cy
    .get(sel.memberCard)
    .find(sel.balanceValue)
    .invoke('text')
    .then((text) => {
      // antd Statistic renders grouped values such as "1,234"
      const parsed = parseInt(text.replace(/[^\d-]/g, ''), 10);
      expect(parsed, `parsed UI balance from "${text}"`).to.be.a('number');
      return parsed;
    });
});

Cypress.Commands.add(
  'submitAdjustment',
  (points: number, reason: ReasonCode, description?: string) => {
    cy.get(sel.adjustmentCard).within(() => {
      cy.get(sel.pointsInput).clear().type(String(points));
      // Click the selector box, not the hidden search input antd renders inside it.
      cy.get(sel.reasonSelectWrapper).click();
    });
    cy.get(sel.reasonDropdown)
      .find(sel.reasonOption)
      .contains(reasonLabels[reason])
      .click();
    cy.get(sel.adjustmentCard).within(() => {
      if (description) {
        cy.get(sel.descriptionInput).clear().type(description);
      }
      cy.get(sel.submitButton).click();
    });
  }
);

Cypress.Commands.add('expectMessage', (text: string | RegExp) => {
  cy.get(sel.message, { timeout: 12000 })
    .should('be.visible')
    .invoke('text')
    .should((actual) => {
      if (typeof text === 'string') {
        expect(actual).to.contain(text);
      } else {
        expect(actual).to.match(text);
      }
    });
});

export {};
