/**
 * Typed event bus for engine ↔ UI communication.
 * Game loop emits events, React listens. React dispatches commands, game loop reads.
 */

type Listener<T = unknown> = (data: T) => void

class EventBus {
  private listeners = new Map<string, Set<Listener>>()

  on<T = unknown>(event: string, fn: Listener<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    const set = this.listeners.get(event)!
    set.add(fn as Listener)
    return () => set.delete(fn as Listener)
  }

  emit<T = unknown>(event: string, data?: T): void {
    const set = this.listeners.get(event)
    if (set) for (const fn of set) fn(data)
  }

  clear(): void {
    this.listeners.clear()
  }
}

export const events = new EventBus()
