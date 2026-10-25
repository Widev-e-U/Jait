import type { SteeringController, SteeringMessage } from "../tools/agent-loop.js";

/** Sends FIFO guidance during a CLI turn, consuming only acknowledged messages. */
export class ProviderSteeringDispatcher {
  private active = false;
  private blocked = false;
  private disposed = false;
  private pending: Promise<void> | undefined;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly queue: SteeringController,
    private readonly deliver: (message: string) => Promise<boolean>,
    private readonly consumed: (message: SteeringMessage) => void,
    private readonly failed: (error: unknown) => void,
  ) {
    this.unsubscribe = queue.onPending(() => this.kick());
  }

  start(): void {
    if (this.disposed) return;
    this.active = true;
    this.blocked = false;
    this.kick();
  }

  /** Close the turn boundary before draining fallback; an in-flight ack owns its message. */
  async pause(): Promise<void> {
    this.active = false;
    await this.pending;
  }

  dispose(): void {
    this.active = false;
    this.disposed = true;
    this.unsubscribe();
  }

  private kick(): void {
    if (!this.active || this.blocked || this.pending || this.disposed || !this.queue.hasPending) return;
    // Defer until sendTurn has placed the prompt on the ACP connection.
    this.pending = Promise.resolve().then(async () => {
      while (this.active && !this.disposed) {
        const message = this.queue.peek();
        if (!message) break;
        let accepted = false;
        try {
          accepted = await this.deliver(`[STEERING] ${message.message}`);
        } catch (error) {
          this.failed(error);
        }
        if (!accepted) {
          this.blocked = true;
          break;
        }
        if (this.queue.consume(message) && !this.disposed) this.consumed(message);
      }
    }).finally(() => {
      this.pending = undefined;
      this.kick();
    });
  }
}
