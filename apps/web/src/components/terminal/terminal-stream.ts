export interface TerminalOutputPayload {
  type?: string
  terminalId?: string
  data?: string
  streamId?: string
  seq?: number
  replay?: boolean
}

export function shouldAcceptTerminalOutput(
  lastSeqByStream: Map<string, number>,
  terminalId: string,
  payload: TerminalOutputPayload | undefined,
): payload is TerminalOutputPayload & { data?: string } {
  if (!payload || payload.type !== 'terminal.output' || payload.terminalId !== terminalId) {
    return false
  }

  if (!payload.streamId || typeof payload.seq !== 'number') {
    return true
  }

  const lastSeq = lastSeqByStream.get(payload.streamId) ?? -1
  if (payload.seq <= lastSeq) {
    return false
  }

  lastSeqByStream.set(payload.streamId, payload.seq)
  return true
}
