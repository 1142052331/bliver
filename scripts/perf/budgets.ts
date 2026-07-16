export const V2_BUDGETS = {
  initialNonMapJsGzipBytes: 200_000,
  lcpMs: 2_500,
  inpMs: 200,
  cls: 0.1,
  mapApiP95Ms: 400,
  commandApiP95Ms: 300,
  maxOutboxLagMs: 5_000,
  routeChunkRegressionRatio: 0.1,
  maxApprovedSequentialScanRows: 5_000,
  maxApiErrorRate: 0,
} as const;
