/**
 * Waits for both the promise and a minimum time so quick responses still show a loader briefly.
 * Total time is max(promise, ms) — never slower than the network, only adds padding when fast.
 */
export function withMinimumDelay<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.all([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]).then(([result]) => result);
}
