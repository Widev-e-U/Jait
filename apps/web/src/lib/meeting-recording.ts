import { createMeetingRecordingApi } from '@jait/api-client'
import { apiFetch } from './api-fetch'
import { getApiUrl } from './gateway-url'

export const meetingRecordingApi = createMeetingRecordingApi((path, init) => apiFetch(getApiUrl() + path, init))

export interface LocalMeetingAudio {
  id: string
  startedAt: string
  audio: Blob
}

export function meetingAudioStore(owner: string, operation: 'read' | 'write' | 'delete', recording?: LocalMeetingAudio): Promise<LocalMeetingAudio | undefined> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('jait-meeting-audio', 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore('recordings')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const transaction = database.transaction('recordings', operation === 'read' ? 'readonly' : 'readwrite')
      const store = transaction.objectStore('recordings')
      const request = operation === 'read' ? store.get(owner) : operation === 'delete' ? store.delete(owner) : store.put(recording, owner)
      transaction.oncomplete = () => { database.close(); resolve(operation === 'read' ? request.result : undefined) }
      transaction.onabort = () => { database.close(); reject(transaction.error) }
    }
  })
}

export function audioBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
