import { createRoot } from 'react-dom/client'
import { TeamRoomView } from '@/components/manager/team-room'
import { initAuthToken } from '@/lib/auth-token'
import '../index.css'

void initAuthToken().then(() => createRoot(document.getElementById('root')!).render(<main className="flex h-screen flex-col"><TeamRoomView roomId={new URLSearchParams(window.location.search).get('roomId') || 'fixture-room'} onBack={() => {}} /></main>))
