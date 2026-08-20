import { resolveDeployer } from '../lib/deployer';
import { resourceNames, REGION } from '../lib/config';

/**
 * Fixed deployer for assertions.
 *
 * Deliberately not read from .env: a test whose expectations change with
 * someone's local configuration is not a test. It also keeps the suite honest
 * about prefixing — every asserted name is derived, so a stack that hardcodes a
 * literal will fail here.
 */
export const TEST_DEPLOYER = resolveDeployer({ DEPLOYER: 'Test-Group' });
export const TEST_NAMES = resourceNames(TEST_DEPLOYER);
export const TEST_ENV = { account: '111111111111', region: REGION };
