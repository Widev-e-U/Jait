import { describe, expect, it } from 'vitest'
import { segmentTeamMentions, type TeamMentionMember } from '@/lib/team-mentions'

const captain = { id: 'agent-captain', name: 'Captain Standup', avatar: 'Nova' }
const lady = { id: 'agent-lady', name: 'Lady Merge-a-Lot', avatar: 'Ember' }
const gandalf = { id: 'agent-gandalf', name: 'Gandalf the Git', avatar: 'Atlas' }
const bugzilla = { id: 'agent-bugzilla', name: 'Bugzilla', avatar: null }

const members: TeamMentionMember[] = [captain, lady, gandalf, bugzilla]

/** Text-only projection used for the round-trip assertions. */
const textOf = (content: string, list: TeamMentionMember[] = members) =>
  segmentTeamMentions(content, list).map(segment => segment.text).join('')

const mentionsOf = (content: string, list: TeamMentionMember[] = members) =>
  segmentTeamMentions(content, list).filter(segment => segment.kind === 'mention').map(segment => segment.member.name)

describe('segmentTeamMentions — recognized mentions', () => {
  it('resolves a multi-word full name', () => {
    const segments = segmentTeamMentions('Hey @Captain Standup, please review.', members)
    expect(segments).toEqual([
      { kind: 'text', text: 'Hey ' },
      { kind: 'mention', text: '@Captain Standup', member: captain },
      { kind: 'text', text: ', please review.' },
    ])
  })

  it('resolves every multi-word full name in the room, including hyphens', () => {
    expect(mentionsOf('@Captain Standup @Lady Merge-a-Lot @Gandalf the Git')).toEqual([
      'Captain Standup',
      'Lady Merge-a-Lot',
      'Gandalf the Git',
    ])
  })

  it('matches case-insensitively and keeps the original casing in the text', () => {
    const segments = segmentTeamMentions('@captain standup and @LADY MERGE-A-LOT', members).filter(segment => segment.kind === 'mention')
    expect(segments.map(segment => segment.text)).toEqual(['@captain standup', '@LADY MERGE-A-LOT'])
    expect(segments.map(segment => segment.member.id)).toEqual(['agent-captain', 'agent-lady'])
  })

  it('prefers the longest member name that shares a prefix', () => {
    const list = [...members, { id: 'agent-captain-short', name: 'Captain', avatar: 'Nova' }]
    const segments = segmentTeamMentions('@Captain Standup', list).filter(segment => segment.kind === 'mention')
    expect(segments).toHaveLength(1)
    expect(segments[0]!.member.name).toBe('Captain Standup')

    const shorterOnly = segmentTeamMentions('@Captain, hello', list).filter(segment => segment.kind === 'mention')
    expect(shorterOnly.map(segment => segment.member.name)).toEqual(['Captain'])
  })

  it('resolves multiple distinct mentions and every repeat of one mention', () => {
    const content = '@Bugzilla @Bugzilla please hand @Captain Standup the log'
    expect(mentionsOf(content)).toEqual(['Bugzilla', 'Bugzilla', 'Captain Standup'])
  })

  it('resolves mentions at the start of the body and at end-of-line', () => {
    expect(mentionsOf('@Bugzilla')).toEqual(['Bugzilla'])
    expect(mentionsOf('over to you\n@Lady Merge-a-Lot')).toEqual(['Lady Merge-a-Lot'])
  })

  it('resolves a mention followed by punctuation or an apostrophe', () => {
    expect(mentionsOf('@Captain Standup: status?')).toEqual(['Captain Standup'])
    expect(mentionsOf("thanks @Bugzilla's report")).toEqual(['Bugzilla'])
    expect(mentionsOf('(@Gandalf the Git)')).toEqual(['Gandalf the Git'])
  })

  it('falls back to current behaviour when the member avatar is null', () => {
    const segments = segmentTeamMentions('@Bugzilla', members).filter(segment => segment.kind === 'mention')
    expect(segments[0]!.member.avatar).toBeNull()
  })
})

describe('segmentTeamMentions — text preservation and non-matches', () => {
  it('leaves an unknown @name as plain readable text', () => {
    expect(segmentTeamMentions('@Nobody Special, ping', members)).toEqual([{ kind: 'text', text: '@Nobody Special, ping' }])
  })

  it('leaves a member name that runs into more word characters alone', () => {
    expect(mentionsOf('@BugzillaX is not a member')).toEqual([])
  })

  it('leaves email-like a@b tokens alone', () => {
    expect(mentionsOf('mail me at bugzilla@example.com')).toEqual([])
    expect(textOf('mail me at bugzilla@example.com')).toBe('mail me at bugzilla@example.com')
  })

  it('handles a body with no mentions, an empty body and a lone @', () => {
    expect(segmentTeamMentions('plain prose only', members)).toEqual([{ kind: 'text', text: 'plain prose only' }])
    expect(segmentTeamMentions('', members)).toEqual([])
    expect(segmentTeamMentions('@', members)).toEqual([{ kind: 'text', text: '@' }])
  })

  it('tolerates a room with no members and blank member names', () => {
    expect(segmentTeamMentions('@Captain Standup', [])).toEqual([{ kind: 'text', text: '@Captain Standup' }])
    expect(segmentTeamMentions('@Captain Standup', [{ id: 'x', name: '   ' }])).toEqual([{ kind: 'text', text: '@Captain Standup' }])
  })

  it('round-trips a realistic multi-line body exactly', () => {
    const content = [
      '@Captain Standup, the fix is ready for review by @Bugzilla.',
      '',
      'Evidence for @Lady Merge-a-Lot:',
      '  bun run test  # see @NotAMember in the log',
      'Ping @Bugzilla again when merged.',
    ].join('\n')
    expect(textOf(content)).toBe(content)
    expect(mentionsOf(content)).toEqual(['Captain Standup', 'Bugzilla', 'Lady Merge-a-Lot', 'Bugzilla'])
  })

  it('keeps the mention list empty for a handoff-style body with unknown names', () => {
    const content = '@assistant please leave @SomeUnknownName alone'
    expect(mentionsOf(content)).toEqual([])
    expect(textOf(content)).toBe(content)
  })
})
