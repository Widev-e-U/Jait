import { describe, it, expect, beforeEach } from "vitest";
import { __chatTestUtils } from "./routes/chat.js";

/**
 * Regression test for the "stream stuck loading" bug.
 *
 * When a client reconnects to a running turn via the resume SSE stream
 * (`GET /api/sessions/:id/stream`), it subscribes with
 * `minSeqExclusive = snapshotSeq` where `snapshotSeq >= 1` for any mid-run
 * resume. The success-path `done` event must therefore be sequenced AFTER the
 * per-session counter is still present, so it gets `seq = counter + 1 > snapshotSeq`
 * and is delivered to the resume subscriber (closing the stream and clearing
 * `isLoading`).
 *
 * The bug was that `sessionStreamSeq.delete(sessionId)` ran BEFORE the final
 * `emitToSubscribers(sessionId, doneEvent)`, so the done event got `seq = 1`
 * and was dropped by the `event.seq <= minSeqExclusive` gate.
 */

const { sessionStreamSeq, sessionSubscribers, subscribe, emitToSubscribers, emitTurnDone } = __chatTestUtils;

const SESSION = "seq-gate-session";

function makeDoneEvent() {
  return {
    type: "done" as const,
    session_id: SESSION,
    prompt_count: 1,
    remaining_prompts: null,
  };
}

beforeEach(() => {
  sessionStreamSeq.clear();
  sessionSubscribers.clear();
});

describe("seq gate: success-path done delivery to resume subscribers", () => {
  it("delivers the done event to a mid-run resume subscriber (emit before delete)", () => {
    // Simulate a turn that has already emitted some events, so the counter is >= 1.
    sessionStreamSeq.set(SESSION, 3);

    // A resume subscriber connects mid-run: snapshotSeq = 3, so minSeqExclusive = 3.
    const received: unknown[] = [];
    const unsubscribe = subscribe(SESSION, 3, (event) => {
      received.push(event);
    });

    // Success-path sequence (as fixed): emit done, THEN delete the counter.
    // This calls the same helper the route uses, so it exercises the real code path.
    emitTurnDone(SESSION, makeDoneEvent());

    // The done event must NOT be dropped by the seq gate.
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "done", session_id: SESSION });
    expect((received[0] as { seq: number }).seq).toBe(4); // 3 + 1 > snapshotSeq 3

    unsubscribe();
  });

  it("delivers the done event even when the resume subscriber joined at the very start (snapshotSeq = 0)", () => {
    sessionStreamSeq.set(SESSION, 0);

    const received: unknown[] = [];
    const unsubscribe = subscribe(SESSION, 0, (event) => {
      received.push(event);
    });

    emitTurnDone(SESSION, makeDoneEvent());

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "done" });

    unsubscribe();
  });

  it("documents the bug: deleting the counter before emitting drops the done event", () => {
    // This ordering is the OLD (buggy) behavior. It is asserted to demonstrate
    // why the fix moves the delete AFTER the emit. If this test ever starts
    // passing, the seq gate has been changed and the fix may be unnecessary.
    sessionStreamSeq.set(SESSION, 3);

    const received: unknown[] = [];
    const unsubscribe = subscribe(SESSION, 3, (event) => {
      received.push(event);
    });

    // Buggy ordering: delete counter, THEN emit done.
    sessionStreamSeq.delete(SESSION);
    emitToSubscribers(SESSION, makeDoneEvent());

    // done gets seq = (undefined ?? 0) + 1 = 1, which is <= minSeqExclusive 3 → dropped.
    expect(received).toHaveLength(0);

    unsubscribe();
  });
});
