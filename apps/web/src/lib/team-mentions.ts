/**
 * Group-chat mention segmentation.
 *
 * Pure helper (no React, no DOM) that splits a message body into plain text and
 * recognized `@<member full name>` mentions, so the render site can draw the
 * member's existing `AgentAvatar` beside the name while leaving the message
 * text itself untouched.
 *
 * Matching rules:
 *   - Case-insensitive, longest member name first, so a shorter member name
 *     never wins over a longer one sharing its prefix.
 *   - Multi-word full names resolve (`@Captain Standup`, `@Gandalf the Git`).
 *   - The name must be followed by end-of-string or a non-alphanumeric
 *     character, so `@Captain Standup's` and `@Captain Standup.` resolve while
 *     `@CaptainStandupX` does not.
 *   - An `@` glued to an email-local-part character (`a@b`, `user@host`) is left
 *     alone.
 *   - An `@name` that matches no member stays plain readable text.
 *   - `segments.map(segment => segment.text).join('')` always reproduces the
 *     original body exactly (nothing added, dropped or reordered).
 */

/** Minimal member shape needed for matching — a `PersonaAgentProfile` fits. */
export interface TeamMentionMember {
  id: string
  name: string
  avatar?: string | null
}

export type TeamMentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; member: TeamMentionMember }

/** Characters that would make the preceding `@` part of an email-like token. */
const EMAIL_LOCAL_CHARS = /[A-Za-z0-9._%+-]/
/** Characters that would extend a member name, invalidating the match. */
const NAME_TAIL_CHARS = /[A-Za-z0-9]/

interface MentionCandidate {
  member: TeamMentionMember
  name: string
  lower: string
}

function mentionCandidates(members: readonly TeamMentionMember[]): MentionCandidate[] {
  return members
    .filter(member => typeof member?.name === 'string' && member.name.trim().length > 0)
    .map(member => {
      const name = member.name.trim()
      return { member, name, lower: name.toLowerCase() }
    })
    .sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name))
}

function matchCandidateAt(content: string, at: number, candidates: readonly MentionCandidate[]): MentionCandidate | null {
  for (const candidate of candidates) {
    const end = at + 1 + candidate.name.length
    if (content.slice(at + 1, end).toLowerCase() !== candidate.lower) continue
    const tail = content[end]
    if (tail !== undefined && NAME_TAIL_CHARS.test(tail)) continue
    return candidate
  }
  return null
}

/**
 * Split `content` into text and recognized mention segments, in original order.
 */
export function segmentTeamMentions(content: string, members: readonly TeamMentionMember[]): TeamMentionSegment[] {
  const segments: TeamMentionSegment[] = []
  if (typeof content !== 'string' || content.length === 0) return segments
  const candidates = mentionCandidates(members ?? [])
  let plain = ''
  let cursor = 0

  const flushPlain = () => {
    if (plain) {
      segments.push({ kind: 'text', text: plain })
      plain = ''
    }
  }

  while (cursor < content.length) {
    const at = content.indexOf('@', cursor)
    if (at === -1) {
      plain += content.slice(cursor)
      break
    }
    plain += content.slice(cursor, at)
    const startsToken = at === 0 || !EMAIL_LOCAL_CHARS.test(content[at - 1]!)
    const match = startsToken ? matchCandidateAt(content, at, candidates) : null
    if (!match) {
      // Unknown @name (or email-like '@'): keep the character as plain text.
      plain += '@'
      cursor = at + 1
      continue
    }
    flushPlain()
    segments.push({
      kind: 'mention',
      text: content.slice(at, at + 1 + match.name.length),
      member: match.member,
    })
    cursor = at + 1 + match.name.length
  }

  flushPlain()
  return segments
}
