import { createRoot } from 'react-dom/client'
import { TeamAvatar } from '@/components/manager/team-avatar'
import { Button } from '@/components/ui/button'
import { PERSONA_AVATARS } from '@/lib/persona-agents'
import '../index.css'

const members = PERSONA_AVATARS.slice(0, 7).map((avatar, index) => ({ id: `member-${index}`, name: avatar, avatar }))
createRoot(document.getElementById('root')!).render(<main className="space-y-8 p-4">
  <h1>Team avatar sizes</h1>
  {([24, 64] as const).map(size => <section key={size} aria-label={`${size}px avatars`} className="space-y-6 rounded-xl border p-3">
    <h2>{size}px</h2>
    {[0, 1, 4, 7].map(count => <div key={count} className="flex flex-wrap items-center gap-4">
      <span className="w-full text-xs sm:w-24">{count} members</span>
      <TeamAvatar members={members.slice(0, count)} size={size} />
      <Button variant="outline" className="h-auto"><TeamAvatar members={members.slice(0, count)} size={size} layout="stack" />Team conversation</Button>
    </div>)}
  </section>)}
</main>)
