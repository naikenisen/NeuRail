export default [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@main/*'],
              importNames: ['*'],
              message: 'Renderer and domain layers must not import main process modules.',
            },
            {
              group: ['@infrastructure/*'],
              importNames: ['*'],
              message: 'Domain layer must not import infrastructure modules.',
            },
          ],
        },
      ],
    },
  },
];
