/**
 * Bounded top-N collection by a numeric score. N is expected to be small
 * (default 100), so a sorted array insert is used instead of a heap.
 */
export class TopN<T> {
  private items: T[] = [];

  constructor(
    private readonly n: number,
    private readonly scoreOf: (item: T) => number,
  ) {}

  push(item: T): void {
    if (this.n <= 0) return;
    const score = this.scoreOf(item);
    if (this.items.length < this.n) {
      this.items.push(item);
      this.items.sort((a, b) => this.scoreOf(b) - this.scoreOf(a));
      return;
    }
    const last = this.items[this.items.length - 1];
    if (!last || score <= this.scoreOf(last)) return;
    this.items[this.items.length - 1] = item;
    this.items.sort((a, b) => this.scoreOf(b) - this.scoreOf(a));
  }

  toArray(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  get minScore(): number {
    if (this.items.length === 0) return 0;
    return this.scoreOf(this.items[this.items.length - 1]!);
  }
}
