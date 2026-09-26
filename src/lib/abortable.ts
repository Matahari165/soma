/** Bounds a wait and removes its listener when the underlying operation settles. */
export function abortable<T>(operation: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(operation);
  if (signal.aborted) {
    // The caller may already have started an operation that will reject after cancellation.
    Promise.resolve(operation).catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
