/**
 * Central selector map for the Customer-Service UI (Dev A, antd v5 + React 18).
 *
 * NOTE: the SPA currently ships no `data-testid` attributes, so these selectors lean on
 * antd component classes. They are centralised here so a UI refactor only breaks one file.
 * Improvement requested from Dev A: add `data-testid` to the search input, member card,
 * adjustment form fields and history table.
 */
export const sel = {
  // App shell
  appHeader: '.ant-layout-header',

  // MemberLookup
  searchInput: 'input[placeholder="Enter Member ID (e.g. M1001)"]',
  searchButton: '.ant-input-search-button',

  // Global feedback (antd message)
  message: '.ant-message-notice-content',

  // MemberInfo
  memberCard: '.ant-card:has(.ant-card-head-title:contains("Member Information"))',
  balanceValue: '.ant-statistic-content-value',
  tierTag: '.ant-tag',
  descriptionsLabel: '.ant-descriptions-item-label',
  descriptionsContent: '.ant-descriptions-item-content',

  // AdjustmentForm
  adjustmentCard: '.ant-card:has(.ant-card-head-title:contains("Manual Adjustment"))',
  pointsInput: '#points',
  reasonSelect: '#reasonCode',
  reasonSelectWrapper: '.ant-select',
  reasonDropdown: '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
  reasonOption: '.ant-select-item-option',
  descriptionInput: '#description',
  submitButton: 'button[type="submit"]',
  fieldError: '.ant-form-item-explain-error',

  // TransactionHistory
  historyCard: '.ant-card:has(.ant-card-head-title:contains("Transaction History"))',
  historyTable: '.ant-table',
  historyRow: '.ant-table-tbody > tr.ant-table-row',
  historyExpandIcon: '.ant-table-row-expand-icon',
  historyExpandedRow: 'tr.ant-table-expanded-row',
  paginationNext: '.ant-pagination-next',
  paginationPrev: '.ant-pagination-prev',
  paginationItem: '.ant-pagination-item',
  paginationTotal: '.ant-pagination-total-text',
} as const;

/** Reason code dropdown labels as rendered by AdjustmentForm.tsx */
export const reasonLabels = {
  GOODWILL: 'Goodwill',
  SYSTEM_ERROR: 'System Error Correction',
  FRAUD_DEDUCT: 'Fraud Deduction',
  EVENT_BONUS: 'Event Bonus',
} as const;

export type ReasonCode = keyof typeof reasonLabels;
