import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        process:       'readonly',
        __dirname:     'readonly',
        __filename:    'readonly',
        require:       'readonly',
        module:        'readonly',
        exports:       'readonly',
        Buffer:        'readonly',
        setTimeout:      'readonly',
        clearTimeout:    'readonly',
        setInterval:     'readonly',
        clearInterval:   'readonly',
        setImmediate:    'readonly',
        clearImmediate:  'readonly',
        console:         'readonly',
        URL:             'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console':     'off',
      'no-var':         'error',
      'prefer-const':   'warn',
    },
  },
  {
    ignores: ['node_modules/**', 'prisma/**'],
  },
]
