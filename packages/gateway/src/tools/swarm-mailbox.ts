/**
 * Swarm round mailbox — lets specialists spawned concurrently in the same
 * parallel batch (via agent.spawn / agent) post short notes to each other
 * and read what siblings have posted, without any request/response blocking.
 *
 * A "round" exists only for the lifetime of one parallel `Promise.all` batch
 * in the agent loop — created right before dispatch, torn down right after,
 * so mailboxes can never outlive the specialists that share them.
 */

export interface SwarmMessage {
  from: string;
  content: string;
  postedAt: number;
}

interface SwarmRound {
  participantCount: number;
  messages: SwarmMessage[];
}

const rounds = new Map<string, SwarmRound>();

export function createSwarmRound(roundId: string, participantCount: number): void {
  rounds.set(roundId, { participantCount, messages: [] });
}

export function endSwarmRound(roundId: string): void {
  rounds.delete(roundId);
}

export function postSwarmMessage(roundId: string, from: string, content: string): SwarmMessage[] {
  const round = rounds.get(roundId);
  if (!round) return [];
  round.messages.push({ from, content, postedAt: Date.now() });
  return round.messages;
}

export function peekSwarmMessages(roundId: string): SwarmMessage[] {
  return rounds.get(roundId)?.messages ?? [];
}

export function getSwarmParticipantCount(roundId: string): number {
  return rounds.get(roundId)?.participantCount ?? 0;
}
