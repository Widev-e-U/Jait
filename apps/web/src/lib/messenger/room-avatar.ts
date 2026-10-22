import type { MessengerRoom } from './model'

/** The subset of `MessengerPeerAvatar` props that a chats-panel row decides. */
export interface RoomAvatarProps {
  name: string
  mxcUrl?: string
  rounded?: 'full' | 'lg'
  fallback?: string
}

/**
 * Avatar for one conversation row in the chats panel.
 *
 * The snapshot carries the picture twice — `peer.avatarUrl` for direct chats and
 * `avatarUrl` for rooms/channels — but the rows used to ignore both and render
 * initials, so pictures only appeared inside the open conversation. Prefer the
 * peer's own picture, fall back to the room's, and keep the initials (or `#` for
 * a channel) only when neither exists. Empty strings count as "no picture".
 */
export function chatListAvatarProps(room: MessengerRoom, channel = false): RoomAvatarProps {
  const mxcUrl = room.peer?.avatarUrl || room.avatarUrl || undefined
  const props: RoomAvatarProps = { name: room.peer?.name || room.name }
  if (channel) {
    props.rounded = 'lg'
    props.fallback = '#'
  }
  if (mxcUrl) props.mxcUrl = mxcUrl
  return props
}
