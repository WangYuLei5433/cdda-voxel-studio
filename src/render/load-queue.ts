/** Shared budget for optional assets. Yield between jobs so input and rendering can run. */
export class LoadQueue {
  private active = 0;
  private readonly waiting: { start: () => void; priority: number }[] = [];

  constructor(readonly concurrency = 4, private readonly yieldFrame: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 16))) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid asset concurrency');
  }

  run<T>(work: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        void this.yieldFrame().then(work).then(resolve, reject).finally(() => {
          this.active--;
          this.pump();
        });
      };
      this.waiting.push({ start, priority });
      this.waiting.sort((a, b) => b.priority - a.priority);
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.concurrency && this.waiting.length) this.waiting.shift()!.start();
  }

  get pending(): number { return this.active + this.waiting.length; }
}

export const assetLoads = new LoadQueue();

/** CPU/canvas work on actors has a separate budget so it cannot deadlock nested file loads. */
export const actorAssemblies = new LoadQueue(1);
