import request from 'supertest';
import app from '../../src/app';

/**
 * Supertest-based API client for integration tests.
 * Wraps the Express app directly — no need to start a server.
 *
 * Imports src/app (not src/index) on purpose: src/index binds port 3000, which
 * would collide with a running dev server.
 */
export function apiClient() {
  return request(app);
}

/**
 * Helper: POST to earn endpoint
 */
export function earnPoints(payload: object) {
  return apiClient().post('/api/earn').send(payload).set('Content-Type', 'application/json');
}

/**
 * Helper: POST to adjustments endpoint
 */
export function makeAdjustment(payload: object) {
  return apiClient().post('/api/adjustments').send(payload).set('Content-Type', 'application/json');
}

/**
 * Helper: GET member balance
 */
export function getMemberBalance(memberId: string) {
  return apiClient().get(`/api/members/${memberId}/balance`);
}

/**
 * Helper: GET member history
 */
export function getMemberHistory(memberId: string, query?: Record<string, string>) {
  const req = apiClient().get(`/api/members/${memberId}/history`);
  if (query) {
    req.query(query);
  }
  return req;
}

/**
 * Helper: GET liability report
 */
export function getLiabilityReport() {
  return apiClient().get('/api/reports/liability');
}

/**
 * Helper: POST run expiry (admin)
 */
export function runExpiry() {
  return apiClient().post('/api/admin/run-expiry');
}
