import { describe, expect, it } from "vitest";
import {
  createSwarmRound,
  endSwarmRound,
  getSwarmParticipantCount,
  peekSwarmMessages,
  postSwarmMessage,
} from "./swarm-mailbox.js";

describe("swarm-mailbox", () => {
  it("returns no messages and zero participants for an unknown round", () => {
    expect(peekSwarmMessages("nope")).toEqual([]);
    expect(getSwarmParticipantCount("nope")).toBe(0);
    expect(postSwarmMessage("nope", "a", "hello")).toEqual([]);
  });

  it("collects posted messages in order and makes them visible to peekers", () => {
    createSwarmRound("round-1", 3);
    try {
      postSwarmMessage("round-1", "Research Specialist", "found the root cause");
      postSwarmMessage("round-1", "Fix Specialist", "applying the patch now");

      const messages = peekSwarmMessages("round-1");
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ from: "Research Specialist", content: "found the root cause" });
      expect(messages[1]).toMatchObject({ from: "Fix Specialist", content: "applying the patch now" });
      expect(getSwarmParticipantCount("round-1")).toBe(3);
    } finally {
      endSwarmRound("round-1");
    }
  });

  it("forgets everything once the round ends", () => {
    createSwarmRound("round-2", 2);
    postSwarmMessage("round-2", "a", "note");
    endSwarmRound("round-2");

    expect(peekSwarmMessages("round-2")).toEqual([]);
    expect(getSwarmParticipantCount("round-2")).toBe(0);
  });

  it("keeps rounds isolated from each other", () => {
    createSwarmRound("round-a", 2);
    createSwarmRound("round-b", 2);
    try {
      postSwarmMessage("round-a", "x", "only in a");
      expect(peekSwarmMessages("round-b")).toEqual([]);
      expect(peekSwarmMessages("round-a")).toHaveLength(1);
    } finally {
      endSwarmRound("round-a");
      endSwarmRound("round-b");
    }
  });
});
