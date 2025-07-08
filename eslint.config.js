// Copyright IBM Corp. 2017,2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

module.exports = [
  // Ignore patterns (equivalent to .eslintignore)
  {
    ignores: [
      'coverage/**',
      'dist/**',
    ],
  },
  // Main configuration for all JS files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'script',
      globals: {
        // Node.js globals
        Buffer: 'readonly',
        console: 'readonly',
        exports: 'writable',
        global: 'readonly',
        module: 'writable',
        process: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Mocha globals
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        context: 'readonly',
        specify: 'readonly',
        // Timer functions
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        // Promise
        Promise: 'readonly',
      },
    },
    rules: {
      // LoopBack config rules converted to flat config
      'comma-dangle': ['error', 'always-multiline'],
      'no-cond-assign': 'error',
      'no-console': 'off',
      'no-unused-expressions': 'error',
      'no-const-assign': 'error',
      'array-bracket-spacing': ['error', 'never'],
      'block-spacing': ['error', 'always'],
      'brace-style': ['error', '1tbs', {allowSingleLine: true}],
      'camelcase': ['error', {properties: 'always'}],
      'comma-spacing': ['error', {before: false, after: true}],
      'comma-style': ['error', 'last'],
      'computed-property-spacing': ['error', 'never'],
      'eol-last': ['error', 'unix'],
      'func-names': 0,
      'func-call-spacing': ['error', 'never'],
      'function-paren-newline': ['error', 'consistent'],
      'indent': ['error', 2, {SwitchCase: 1}],
      'key-spacing': ['error', {beforeColon: false, afterColon: true, mode: 'strict'}],
      'keyword-spacing': ['error', {before: true, after: true}],
      'max-len': ['error', 110, 4, {
        ignoreComments: true,
        ignoreUrls: true,
        ignorePattern: '^\\s*var\\s.+=\\s*(require\\s*\\()|(/)',
      }],
      // Note: Mocha plugin rules removed for compatibility with ESLint v9
      // These can be re-added when eslint-plugin-mocha is updated for flat config
      'no-array-constructor': 2,
      'no-extra-semi': 'error',
      'no-multi-spaces': 'error',
      'no-multiple-empty-lines': ['error', {max: 1}],
      'no-redeclare': ['error'],
      'no-trailing-spaces': 2,
      'no-undef': 'error',
      'no-var': 'error',
      'object-curly-spacing': ['error', 'never'],
      'one-var': 'off', // Override from .eslintrc
      'operator-linebreak': ['error', 'after'],
      'padded-blocks': ['error', 'never'],
      'prefer-const': 'error',
      'quotes': ['error', 'single', 'avoid-escape'],
      'semi-spacing': ['error', {before: false, after: true}],
      'semi': ['error', 'always'],
      'space-before-blocks': ['error', 'always'],
      'space-before-function-paren': ['error', {
        anonymous: 'never',
        named: 'never',
        asyncArrow: 'always',
      }],
      'space-in-parens': ['error', 'never'],
      'space-infix-ops': ['error', {int32Hint: false}],
      'spaced-comment': ['error', 'always', {
        line: {markers: ['/'], exceptions: ['-']},
        block: {balanced: true, markers: ['!'], exceptions: ['*']},
      }],
      'strict': ['error', 'global'],
    },
  },
];
