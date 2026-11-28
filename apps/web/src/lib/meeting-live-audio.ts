import { MEETING_PREVIEW_SECONDS } from '@jait/shared'
import processorUrl from './meeting-audio-processor.js?url&no-inline'

const sampleRate = 16000
const updateSeconds = 1
const aacSampleRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
export type MeetingPreviewClip = { offset: number; mimeType: 'audio/wav' | 'audio/aac'; audio: Blob; final: boolean }

function wav(pcm: ArrayBuffer): Blob {
  const header = new DataView(new ArrayBuffer(44))
  header.setUint32(0, 0x52494646) // RIFF
  header.setUint32(4, 36 + pcm.byteLength, true)
  header.setUint32(8, 0x57415645) // WAVE
  header.setUint32(12, 0x666d7420) // fmt
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true) // PCM
  header.setUint16(22, 1, true)
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * 2, true)
  header.setUint16(32, 2, true)
  header.setUint16(34, 16, true)
  header.setUint32(36, 0x64617461) // data
  header.setUint32(40, pcm.byteLength, true)
  return new Blob([header.buffer, pcm], { type: 'audio/wav' })
}

export async function startMeetingAudioPreview(stream: MediaStream, onClip: (clip: MeetingPreviewClip) => void) {
  const context = new AudioContext({ sampleRate })
  let startupTimer = 0
  try {
    const initialize = Promise.all([context.audioWorklet.addModule(processorUrl), context.resume()])
    const deadline = new Promise<never>((_, reject) => {
      startupTimer = window.setTimeout(() => reject(new Error('Live audio preview did not start.')), 2500)
    })
    await Promise.race([initialize, deadline])
    const node = new AudioWorkletNode(context, 'meeting-audio', {
      channelCount: 1, processorOptions: { seconds: MEETING_PREVIEW_SECONDS, updateSeconds },
    })
    const input = context.createMediaStreamSource(stream)
    let offset = 0
    let onFlush: (() => void) | undefined
    node.port.onmessage = ({ data }: MessageEvent<{ pcm: ArrayBuffer; final: boolean } | null>) => {
      if (!data) { onFlush?.(); return }
      onClip({ offset, mimeType: 'audio/wav', audio: wav(data.pcm), final: data.final })
      if (data.final) offset += data.pcm.byteLength / 2 / sampleRate
    }
    // The worklet emits silence to the graph while it sends captured PCM to Jait.
    node.connect(context.destination)
    return {
      start: () => input.connect(node),
      async finish() {
        input.disconnect()
        const flushed = new Promise<void>(resolve => { onFlush = resolve })
        node.port.postMessage('flush')
        let timer = 0
        const complete = await Promise.race([flushed.then(() => true), new Promise<boolean>(resolve => {
          timer = window.setTimeout(() => resolve(false), 500)
        })])
        window.clearTimeout(timer)
        node.port.close()
        await context.close()
        return complete && offset > 0
      },
    }
  } catch (failure) {
    await context.close().catch(() => {})
    throw failure
  } finally {
    window.clearTimeout(startupTimer)
  }
}

export function androidPreviewFrames(encoded: string, finished: boolean, previousDuration: number) {
  const bytes = Uint8Array.from(atob(encoded), byte => byte.charCodeAt(0))
  let length = 0
  let duration = 0
  while (length + 7 <= bytes.length && duration < MEETING_PREVIEW_SECONDS) {
    if (bytes[length] !== 255 || (bytes[length + 1] & 0xf6) !== 0xf0) throw new Error('Invalid AAC frame')
    const size = ((bytes[length + 3] & 3) << 11) | (bytes[length + 4] << 3) | (bytes[length + 5] >> 5)
    if (size < 7) throw new Error('Invalid AAC frame size')
    if (length + size > bytes.length) break
    const rate = aacSampleRates[(bytes[length + 2] >> 2) & 15]
    if (!rate) throw new Error('Invalid AAC sample rate')
    duration += 1024 * (1 + (bytes[length + 6] & 3)) / rate
    length += size
  }
  const final = finished || duration >= MEETING_PREVIEW_SECONDS
  if (!length || (!final && Math.floor(duration / updateSeconds) <= Math.floor(previousDuration / updateSeconds))) return null
  return { length, duration, final, audio: new Blob([bytes.subarray(0, length)], { type: 'audio/aac' }) }
}
