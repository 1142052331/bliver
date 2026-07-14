module.exports = {
  forbidden: [
    {
      name: 'web-to-api-internal',
      severity: 'error',
      from: { path: '^apps/web/src' },
      to: { path: '^apps/api/src' },
    },
    {
      name: 'api-to-web-ui-feature',
      severity: 'error',
      from: { path: '^apps/api/src' },
      to: { path: '^(apps/web/src|packages/ui/src)' },
    },
    {
      name: 'domain-to-infrastructure',
      severity: 'error',
      from: { path: '^packages/domain/src' },
      to: { path: '^(node:|pg$|express$|drizzle-orm)' },
    },
    {
      name: 'contracts-to-apps',
      severity: 'error',
      from: { path: '^packages/contracts/src' },
      to: { path: '^apps/' },
    },
  ],
  options: {
    doNotFollow: {
      path: '(^|/)(node_modules|dist|generated|frontend|backend)(/|$)',
    },
    exclude: '(^|/)(node_modules|dist|generated|frontend|backend)(/|$)',
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
  },
};
