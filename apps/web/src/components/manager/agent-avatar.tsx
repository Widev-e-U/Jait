import { PERSONA_AVATARS, normalizePersonaAvatar } from '@/lib/persona-agents'
import './agent-avatar.css'

const colors = ['#a78bfa', '#60a5fa', '#fb7185', '#2dd4bf', '#fbbf24', '#86efac', '#fb923c', '#e879f9', '#38bdf8', '#c4b5fd']
const bodies = [
  'M18 42 Q12 20 32 20 Q35 8 45 19 Q68 9 76 31 Q89 51 73 72 Q49 85 26 72 Q13 63 18 42Z',
  'M22 30 Q20 12 32 17 L41 25 Q50 21 59 25 L69 15 Q81 12 76 33 Q90 68 69 77 Q48 86 28 75 Q10 64 22 30Z',
  'M19 43 Q10 27 26 23 Q26 9 40 17 Q51 6 61 20 Q83 15 80 39 Q94 58 76 75 Q51 87 27 74 Q9 62 19 43Z',
  'M17 51 Q15 28 33 24 Q45 10 59 23 Q84 23 82 51 Q82 80 50 81 Q18 81 17 51Z',
  'M22 35 L25 15 Q37 15 40 28 Q49 24 58 28 Q62 13 74 16 L77 38 Q86 66 68 77 Q47 86 29 75 Q14 61 22 35Z',
]
export function AgentAvatar({ avatar, running = false, className = 'h-16 w-16' }: { avatar: string; running?: boolean; className?: string }) {
  const index = PERSONA_AVATARS.indexOf(normalizePersonaAvatar(avatar))
  return <svg aria-hidden="true" viewBox="0 0 100 100" className={`agent-creature ${running ? 'agent-creature-working' : ''} ${className} shrink-0 overflow-visible`} style={{ animationDelay: `-${index * 0.37}s` }}>
    <ellipse cx="50" cy="87" rx="24" ry="4" fill={colors[index]} opacity=".14" />
    <g className="agent-creature-body">
      <path d={bodies[index % bodies.length]} fill={colors[index]} />
      <path d="M25 57 Q18 51 17 60 M75 57 Q83 51 84 60" fill="none" stroke={colors[index]} strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="29" cy="59" rx="5" ry="3" fill="#fff" opacity=".25" />
      <ellipse cx="71" cy="59" rx="5" ry="3" fill="#fff" opacity=".25" />
      <g className="agent-creature-eyes" style={{ animationDelay: `-${index * 0.63}s` }}>
        <ellipse cx="38" cy="46" rx="7" ry="9" fill="#fff" />
        <ellipse cx="62" cy="46" rx="7" ry="9" fill="#fff" />
        <ellipse cx={index % 2 ? 39 : 37} cy="47" rx="3" ry="4.5" fill="#243047" />
        <ellipse cx={index % 2 ? 63 : 61} cy="47" rx="3" ry="4.5" fill="#243047" />
      </g>
      <path d={index % 3 === 0 ? 'M43 62 Q50 69 57 62' : index % 3 === 1 ? 'M46 63 Q50 66 54 63' : 'M44 62 Q50 66 56 62'} fill="none" stroke="#243047" strokeWidth="2.5" strokeLinecap="round" />
      {index >= 5 && <path d="M44 25 Q49 17 55 25" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".5" />}
    </g>
  </svg>
}
