/** Durable owner-wide autonomous execution state, shared by gateway and web. */
export interface AgentControlState {
  halted: boolean;
  reason: string | null;
  haltedAt: string | null;
  updatedAt: string | null;
}

export interface AgentHaltResult {
  state: AgentControlState;
  stopped: number;
  /** Halt is persisted even when an individual runner refuses to stop. */
  stopError: string | null;
}
