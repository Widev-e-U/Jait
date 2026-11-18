import { describe, expect, it } from 'vitest'
import { matchWakeTranscript } from './wake-word'

describe('wake word matching', () => {
  it.each([
    ['Hey, Jade, what time is it?', 'what time is it?'],
    ['hey jait run the tests', 'run the tests'],
    ['Jait!', ''],
    ['Hej tschait, hilf mir bitte', 'hilf mir bitte'],
  ])('keeps the request after %s', (transcript, command) => {
    expect(matchWakeTranscript(transcript)).toEqual({ kind: 'direct', command })
  })
  it.each(['The date is tomorrow', 'Hey jadeite is green', 'I will get the gate', 'jade is a gemstone', 'jake is here'])('does not activate for %s', transcript => {
    expect(matchWakeTranscript(transcript)).toEqual({ kind: 'none' })
  })
  it('marks plausible but ambiguous names for review', () => {
    expect(matchWakeTranscript('Hey, Jay, turn on the lights')).toEqual({ kind: 'ambiguous', command: 'turn on the lights' })
  })
  it('honors explicitly configured phrases without substring matches', () => {
    expect(matchWakeTranscript('Hello Computer, check this', ['hello computer'])).toEqual({ kind: 'direct', command: 'check this' })
    expect(matchWakeTranscript('Hello Computerized world', ['hello computer'])).toEqual({ kind: 'none' })
  })
})
