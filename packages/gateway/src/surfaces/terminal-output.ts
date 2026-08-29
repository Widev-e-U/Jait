export function getTerminalOutputSlice(
  outputBuffer: string[],
  outputChunkCount: number,
  outputOffset: number,
  outputEndOffset?: number,
  lines = 100,
  trimAtDoneMarker = false,
): string {
  const normalizedOffset = Number.isFinite(outputOffset) ? Math.max(0, Math.trunc(outputOffset)) : 0;
  const normalizedEndOffset = typeof outputEndOffset === "number" && Number.isFinite(outputEndOffset)
    ? Math.max(normalizedOffset, Math.trunc(outputEndOffset))
    : outputChunkCount;
  const retainedStart = Math.max(0, outputChunkCount - outputBuffer.length);
  const offsetIndex = Math.max(0, Math.min(outputBuffer.length, normalizedOffset - retainedStart));
  const endIndex = Math.max(offsetIndex, Math.min(outputBuffer.length, normalizedEndOffset - retainedStart));
  const startIndex = Math.max(offsetIndex, endIndex - lines);
  let output = outputBuffer.slice(startIndex, endIndex).join("");

  // The end offset can point *into* the chunk that carries the OSC 633;D
  // "command finished" marker: the marker usually arrives bundled with the
  // next prompt redraw (633;A/633;E/633;B + prompt text) in the same PTY
  // read. The toolcard must render only the command's own output, so when
  // the caller knows the end offset was pinned at a D marker, cut the
  // joined slice at the marker itself — everything after it (marker plus
  // next-prompt drawing) belongs to the shell, not the command.
  if (trimAtDoneMarker) {
    const doneIndex = output.lastIndexOf("\x1b]633;D");
    if (doneIndex !== -1) output = output.slice(0, doneIndex);
  }

  if (startIndex !== offsetIndex || offsetIndex === 0) return output;

  const outputBeforeOffset = outputBuffer.slice(0, offsetIndex).join("");
  const activeLineStart = Math.max(
    outputBeforeOffset.lastIndexOf("\n"),
    outputBeforeOffset.lastIndexOf("\r"),
  ) + 1;
  return outputBeforeOffset.slice(activeLineStart) + output;
}