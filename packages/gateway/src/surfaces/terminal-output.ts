export function getTerminalOutputSlice(
  outputBuffer: string[],
  outputChunkCount: number,
  outputOffset: number,
  outputEndOffset?: number,
  lines = 100,
): string {
  const normalizedOffset = Number.isFinite(outputOffset) ? Math.max(0, Math.trunc(outputOffset)) : 0;
  const normalizedEndOffset = typeof outputEndOffset === "number" && Number.isFinite(outputEndOffset)
    ? Math.max(normalizedOffset, Math.trunc(outputEndOffset))
    : outputChunkCount;
  const retainedStart = Math.max(0, outputChunkCount - outputBuffer.length);
  const offsetIndex = Math.max(0, Math.min(outputBuffer.length, normalizedOffset - retainedStart));
  const endIndex = Math.max(offsetIndex, Math.min(outputBuffer.length, normalizedEndOffset - retainedStart));
  const startIndex = Math.max(offsetIndex, endIndex - lines);
  const output = outputBuffer.slice(startIndex, endIndex).join("");

  if (startIndex !== offsetIndex || offsetIndex === 0) return output;

  const outputBeforeOffset = outputBuffer.slice(0, offsetIndex).join("");
  const activeLineStart = Math.max(
    outputBeforeOffset.lastIndexOf("\n"),
    outputBeforeOffset.lastIndexOf("\r"),
  ) + 1;
  return outputBeforeOffset.slice(activeLineStart) + output;
}
