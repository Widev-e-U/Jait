/**
 * UUIDv7 — time-sortable unique identifiers.
 *
 * Format: 48-bit ms timestamp + 4-bit version (7) + 12-bit rand + 2-bit variant + 62-bit rand
 * Total: 128 bits, lexicographically sortable by creation time.
 */
export declare function uuidv7(): string;
/** Generate a new action ID (UUIDv7). */
export declare function newActionId(): string;
//# sourceMappingURL=uuidv7.d.ts.map