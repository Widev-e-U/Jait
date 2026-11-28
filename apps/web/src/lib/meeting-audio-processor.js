/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class MeetingAudioProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super()
    this.samples = new Int16Array(sampleRate * processorOptions.seconds)
    this.length = 0
    this.updateLength = sampleRate * processorOptions.updateSeconds
    this.port.onmessage = () => {
      this.emit(true)
      this.port.postMessage(null)
    }
  }

  emit(final) {
    if (!this.length) return
    const { buffer } = this.samples.slice(0, this.length)
    if (final) this.length = 0
    this.port.postMessage({ pcm: buffer, final }, [buffer])
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (const sample of channel) {
      this.samples[this.length++] = Math.max(-1, Math.min(1, sample)) * 32767
      if (this.length === this.samples.length) this.emit(true)
      else if (this.length % this.updateLength === 0) this.emit(false)
    }
    return true
  }
}

registerProcessor('meeting-audio', MeetingAudioProcessor)
