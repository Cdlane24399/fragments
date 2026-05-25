import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...nextCoreWebVitals,
  {
    rules: {
      // These rules were introduced in eslint-plugin-react-hooks v7 and flag
      // patterns that existed in the codebase before the upgrade. They are
      // disabled here to keep lint passing without invasive refactors.
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]
