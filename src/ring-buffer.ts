export class RingBuffer<T> {
  private buffer: (T | undefined)[]
  private head = 0
  private _size = 0
  readonly capacity: number

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('RingBuffer capacity must be a positive integer')
    }
    this.capacity = capacity
    this.buffer = new Array<T | undefined>(capacity)
  }

  push(item: T): T | undefined {
    const evicted = this.isFull ? this.buffer[this.head] : undefined
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (!this.isFull) {
      this._size += 1
    }
    return evicted
  }

  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) {
      return undefined
    }
    const start = this.isFull ? this.head : 0
    return this.buffer[(start + index) % this.capacity]
  }

  latest(): T | undefined {
    if (this._size === 0) {
      return undefined
    }
    const index = (this.head - 1 + this.capacity) % this.capacity
    return this.buffer[index]
  }

  oldest(): T | undefined {
    return this.get(0)
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let index = 0; index < this._size; index += 1) {
      const item = this.get(index)
      if (item !== undefined) {
        yield item
      }
    }
  }

  toArray(): T[] {
    return [...this]
  }

  get size(): number {
    return this._size
  }

  get isFull(): boolean {
    return this._size === this.capacity
  }

  clear(): void {
    this.buffer = new Array<T | undefined>(this.capacity)
    this.head = 0
    this._size = 0
  }
}
