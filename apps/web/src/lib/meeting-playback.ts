// WASAPI returns mono float PCM at 16 kHz. Route it into the recorded stream
// alongside microphone audio and keep it disconnected from the local speakers.
export async function mixWindowsMeetingPlayback(microphone: MediaStream, onInterrupted: () => void) {
  const playback = window.jaitDesktop?.meetingPlayback
  if (!playback) return { stream: microphone, release: () => {} }

  const context = new AudioContext()
  const destination = context.createMediaStreamDestination()
  const voice = context.createMediaStreamSource(microphone)
  const gain = context.createGain()
  gain.gain.value = 0.7
  voice.connect(gain)
  gain.connect(destination)
  try {
    await context.resume()
    await playback('start')
  } catch (error) {
    void context.close()
    throw error
  }

  let stopped = false
  let reading = false
  let nextTime = 0
  const timer = window.setInterval(async () => {
    if (reading || stopped) return
    reading = true
    try {
      const payload = await playback('read')
      if (stopped || !payload) return
      const data = Uint8Array.from(atob(payload), byte => byte.charCodeAt(0))
      const pcm = new Float32Array(data.buffer)
      const buffer = context.createBuffer(1, pcm.length, 16_000)
      buffer.copyToChannel(pcm, 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      const now = context.currentTime
      nextTime = Math.min(Math.max(now + 0.03, nextTime), now + 0.25)
      source.start(nextTime)
      nextTime += buffer.duration
    } catch {
      if (!stopped) onInterrupted()
    } finally { reading = false }
  }, 50)
  return {
    stream: destination.stream,
    release: () => {
      stopped = true
      window.clearInterval(timer)
      destination.stream.getTracks().forEach(track => track.stop())
      void playback('stop').catch(() => {})
      void context.close().catch(() => {})
    },
  }
}
