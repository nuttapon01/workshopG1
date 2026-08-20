/**
 * Conventional Commits enforcement.
 *
 * Scopes match the units in .aidlc/specs/pointhub/units.md plus the delivery
 * concerns added by the CI/CD work, so `git log --grep` stays useful per area.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'api',
        'engine',
        'db',
        'cs-ui',
        'expiry',
        'qa',
        'ci',
        'docker',
        'infra',
        'deps',
        'docs',
        'spec',
      ],
    ],
    'subject-case': [2, 'never', ['pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
  },
};
