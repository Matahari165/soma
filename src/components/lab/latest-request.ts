export class LatestRequest {
  private sequence = 0;
  private controller: AbortController | null = null;

  start() {
    this.cancel();
    const controller = new AbortController();
    const sequence = ++this.sequence;
    this.controller = controller;
    return {
      signal: controller.signal,
      isCurrent: () => this.sequence === sequence && !controller.signal.aborted,
    };
  }

  cancel() {
    this.sequence += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
