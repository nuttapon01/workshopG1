/// <reference types="cypress" />

import { sel, reasonLabels } from '../support/selectors';
import { api, getBalance } from '../support/api';

/**
 * Section B — Dev A deliverables: the Customer-Service SPA.
 *
 * Manual-only case:
 *   B1.3  full offline reload (requires disabling the host network adapter)
 */
describe('Section B — Customer-Service UI (Dev A)', () => {
  beforeEach(() => {
    cy.openCsUi();
  });

  describe('B1: Loading & offline compliance', () => {
    it('B1.1 — page loads and the React app renders', () => {
      cy.get(sel.appHeader).should('contain.text', 'PointHub');
      cy.get(sel.searchInput).should('be.visible');
      cy.get(sel.searchButton).should('be.visible');
    });

    it('B1.2 — no runtime requests leave the origin (no CDN, no external fonts)', () => {
      cy.window().then((win) => {
        const origin = win.location.origin;
        const external = win.performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => /^https?:\/\//.test(url) && !url.startsWith(origin));

        expect(external, `external requests: ${external.join(', ') || 'none'}`).to.have.length(0);
      });
    });
  });

  describe('B2: Member lookup (US-001)', () => {
    it('B2.1 — valid member shows balance, tier and joined date', () => {
      cy.lookupMember('M1001');

      cy.get(sel.memberCard).should('be.visible');
      cy.get(sel.memberCard).within(() => {
        cy.get(sel.balanceValue).should('be.visible');
        cy.get(sel.tierTag).should('have.text', 'GOLD');
        cy.get(sel.descriptionsContent).should('contain.text', 'M1001');
      });
      cy.get(sel.descriptionsLabel).should('contain.text', 'Joined');

      // Cross-check against the API of record
      getBalance('M1001').then((apiBalance) => {
        cy.uiBalance().should('eq', apiBalance);
      });
    });

    it('B2.2 — unknown member surfaces "Member not found"', () => {
      cy.lookupMember('M9999');
      cy.expectMessage('Member not found');
      cy.get(sel.memberCard).should('not.exist');
    });

    it('B2.3 — empty input is rejected without calling the API', () => {
      cy.intercept('GET', '/api/members/*').as('memberLookup');
      cy.get(sel.searchButton).click();
      cy.expectMessage(/Please enter a member ID/i);
      cy.get('@memberLookup.all').should('have.length', 0);
    });

    it('B2.4 — result renders within 2 seconds', () => {
      cy.intercept('GET', '/api/members/M1001/balance').as('balance');
      const started = Date.now();
      cy.lookupMember('M1001');
      cy.wait('@balance');
      cy.get(sel.memberCard)
        .should('be.visible')
        .then(() => {
          expect(Date.now() - started, 'lookup render time (ms)').to.be.lessThan(2000);
        });
    });
  });

  describe('B3: Transaction history (US-002)', () => {
    it('B3.1 — history table lists date, type, points and description', () => {
      cy.lookupMember('M1001');
      cy.get(sel.historyCard).should('be.visible');
      cy.get(sel.historyCard).within(() => {
        ['Date', 'Type', 'Points', 'Description'].forEach((heading) => {
          cy.get('th').should('contain.text', heading);
        });
      });
      cy.get(sel.historyRow).should('have.length.greaterThan', 0);
    });

    it('B3.2 — an EARN row expands to per-line campaign attribution', () => {
      // Guarantee at least one EARN row with line details for M1001
      api.earn({
        transactionId: `QAUI${Date.now()}`,
        date: '2026-09-27', // Sat inside C1 (FRESH x3) and C4 (payday x5)
        time: '11:20',
        storeId: 'S003',
        memberId: 'M1001',
        tier: 'GOLD',
        lines: [{ lineNo: 1, category: 'FRESH', amountTHB: 600 }],
      });

      cy.lookupMember('M1001');
      cy.get(sel.historyRow).first().find(sel.historyExpandIcon).click();

      cy.get(sel.historyExpandedRow).within(() => {
        ['Line', 'Category', 'Amount (THB)', 'Campaign', 'Multiplier'].forEach((heading) => {
          cy.get('th').should('contain.text', heading);
        });
        cy.get('.ant-table-tbody > tr').first().should('contain.text', 'FRESH');
        // C4 (x5) outranks C1 (x3) on 27 Sep
        cy.get('.ant-table-tbody > tr').first().should('contain.text', 'x5');
      });
    });

    it('B3.3 — pagination works for a member with more than one page of entries', () => {
      const memberId = 'M1008';
      // Build 22 net-zero entries (+1 / -1 pairs) so the balance is unchanged
      for (let i = 0; i < 11; i += 1) {
        api.adjustment({
          memberId,
          points: 1,
          reasonCode: 'EVENT_BONUS',
          description: `QA pagination fixture +1 #${i}`,
        });
        api.adjustment({
          memberId,
          points: -1,
          reasonCode: 'SYSTEM_ERROR',
          description: `QA pagination fixture -1 #${i}`,
        });
      }

      cy.lookupMember(memberId);
      cy.get(sel.historyCard).within(() => {
        cy.get(sel.historyRow).should('have.length', 20);
        cy.get(sel.paginationNext).should('not.have.class', 'ant-pagination-disabled');
        cy.get(sel.paginationNext).click();
        cy.get('.ant-pagination-item-active').should('have.text', '2');
        cy.get(sel.historyRow).should('have.length.greaterThan', 0);
        cy.get(sel.paginationPrev).click();
        cy.get('.ant-pagination-item-active').should('have.text', '1');
      });
    });

    it('B3.4 — entry types render with their own tag', () => {
      const memberId = 'M1002';
      api.adjustment({
        memberId,
        points: 5,
        reasonCode: 'GOODWILL',
        description: 'QA entry-type fixture',
      });

      cy.lookupMember(memberId);
      cy.get(sel.historyCard)
        .find(sel.historyRow)
        .then(($rows) => {
          const types = [...$rows].map((row) => row.querySelector('.ant-tag')?.textContent ?? '');
          expect(types, 'ADJUSTMENT tag present').to.include('ADJUSTMENT');
          types.forEach((t) => {
            expect(
              ['EARN', 'BURN', 'REFUND_CLAWBACK', 'ADJUSTMENT', 'EXPIRY'],
              `unexpected entry type "${t}"`
            ).to.include(t);
          });
        });
    });
  });

  describe('B4: Manual adjustment (US-003)', () => {
    it('B4.1 — adding points increases the balance by the exact amount', () => {
      cy.lookupMember('M1001');
      cy.uiBalance().then((before) => {
        cy.submitAdjustment(100, 'GOODWILL', 'QA B4.1 add');
        cy.expectMessage(/Adjustment posted/);
        cy.uiBalance().should('eq', before + 100);
        getBalance('M1001').should('eq', before + 100);
      });
    });

    it('B4.2 — deducting points decreases the balance by the exact amount', () => {
      cy.lookupMember('M1001');
      cy.uiBalance().then((before) => {
        cy.submitAdjustment(-50, 'FRAUD_DEDUCT', 'QA B4.2 deduct');
        cy.expectMessage(/Adjustment posted/);
        cy.uiBalance().should('eq', before - 50);
      });
    });

    it('B4.3 — the API rejects a reason code outside the allowed set', () => {
      // The dropdown cannot produce an invalid code (see B4.6), so the guard is asserted
      // at the contract level.
      api
        .adjustment({ memberId: 'M1001', points: 10, reasonCode: 'NOT_A_REASON' })
        .then((res) => {
          expect(res.status).to.eq(400);
          expect(res.body.error).to.contain('Invalid reason code');
        });
    });

    it('B4.4 — zero points is blocked by form validation', () => {
      cy.lookupMember('M1001');
      cy.intercept('POST', '/api/adjustments').as('postAdjustment');

      cy.get(sel.adjustmentCard).within(() => {
        cy.get(sel.pointsInput).clear().type('0');
        cy.get(sel.reasonSelectWrapper).click();
      });
      cy.get(sel.reasonDropdown).find(sel.reasonOption).contains(reasonLabels.GOODWILL).click();
      cy.get(sel.adjustmentCard).find(sel.submitButton).click();

      cy.get(sel.fieldError).should('contain.text', 'Cannot be zero');
      cy.get('@postAdjustment.all').should('have.length', 0);
    });

    it('B4.5 — a new adjustment appears in history immediately with its reason code', () => {
      const note = `QA B4.5 ${Date.now()}`;
      cy.lookupMember('M1003');
      cy.submitAdjustment(25, 'EVENT_BONUS', note);
      cy.expectMessage(/Adjustment posted/);

      cy.get(sel.historyCard).within(() => {
        cy.get(sel.historyRow).first().should('contain.text', note);
        cy.get(sel.historyRow).first().should('contain.text', 'ADJUSTMENT');
        cy.get(sel.historyRow).first().should('contain.text', '+25');
      });

      api.adjustments('M1003').then((res) => {
        const latest = res.body.adjustments[0];
        expect(latest.reasonCode).to.eq('EVENT_BONUS');
        expect(latest.description).to.eq(note);
      });
    });

    it('B4.6 — the reason dropdown offers exactly the four approved codes', () => {
      cy.lookupMember('M1001');
      cy.get(sel.adjustmentCard).find(sel.reasonSelectWrapper).click();
      cy.get(sel.reasonDropdown)
        .find(sel.reasonOption)
        .then(($options) => {
          const labels = [...$options].map((o) => o.textContent?.trim());
          expect(labels).to.have.members(Object.values(reasonLabels));
          expect(labels).to.have.length(4);
        });
    });
  });
});
