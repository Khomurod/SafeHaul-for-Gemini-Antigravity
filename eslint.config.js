import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['**/dist/**', '**/functions/**', 'public/*.min.mjs'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,cjs,mjs}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'warn',
      'no-case-declarations': 'warn',
      'no-unused-vars': 'warn',
      'react-refresh/only-export-components': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'no-prototype-builtins': 'warn',
      'no-constant-condition': 'warn',
      'no-empty': 'warn',
      'no-restricted-imports': ['warn', {
        patterns: [
          {
            group: ['@features/company-admin/components/modals/driver-dossier/*'],
            message: 'Import cross-feature UI from a feature public API (for example @features/company-admin).',
          },
          {
            group: ['@features/campaigns/CampaignsDashboard'],
            message: 'Import from @features/campaigns public API instead of deep implementation paths.',
          },
        ],
      }],
    },
  },
]
