/** Matching-core rate kept separate from the HTTP load test. */
export const MATCHING_CORE_ORDERS_PER_SEC = 670_000;

export const LOAD_TEST = {
  totalOrders: 1350,
  droppedOrders: 0,
  traders: 50,
  matchingLatencyLabel: "< 1 ms",
  baselineP50Ms: 50.41,
  sustainedHttpPerSec: 60,
  stages: [
    {
      name: "Warmup & baseline",
      concurrency: 5,
      orders: 100,
      duration: "1.62s",
      tps: "61.68",
      p50: "50.41 ms",
      p90: "82.00 ms",
      p99: "94.71 ms",
    },
    {
      name: "Medium concurrency",
      concurrency: 15,
      orders: 250,
      duration: "4.35s",
      tps: "57.43",
      p50: "139.41 ms",
      p90: "241.71 ms",
      p99: "275.94 ms",
    },
    {
      name: "High concurrency",
      concurrency: 30,
      orders: 500,
      duration: "8.82s",
      tps: "56.66",
      p50: "275.42 ms",
      p90: "485.59 ms",
      p99: "539.29 ms",
    },
    {
      name: "Max burst",
      concurrency: 50,
      orders: 500,
      duration: "8.92s",
      tps: "56.07",
      p50: "468.18 ms",
      p90: "811.81 ms",
      p99: "898.17 ms",
    },
  ],
} as const;
