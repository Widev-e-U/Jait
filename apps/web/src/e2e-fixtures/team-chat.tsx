import { useEffect, useState } from 'react'
import { ManagerMode } from '@/components/manager/manager-mode'
import { createRoot } from 'react-dom/client'
import { TeamRoomView } from '@/components/manager/team-room'
import { initAuthToken, setAuthToken } from '@/lib/auth-token'
import '../index.css'

function TeamChatsFixture() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return <main className="flex h-screen flex-col"><ManagerMode currentPage="agents" onPageChange={() => {}} isMobile={isMobile} account={{ username: 'Test user', initial: 'T', loading: false, onLogin: () => {}, onLogout: () => {}, themeMode: 'dark', onThemeModeChange: () => {} }}><p>Agents graph</p></ManagerMode></main>
}

if (new URLSearchParams(window.location.search).has('panelFixture')) {
  // The panel fixture uses mocked APIs; real room integration tests retain normal authentication.
  setAuthToken('fixture-token')
  createRoot(document.getElementById('root')!).render(<TeamChatsFixture />)
} else {
  void initAuthToken().then(() => createRoot(document.getElementById('root')!).render(<main className="flex h-screen flex-col"><TeamRoomView roomId={new URLSearchParams(window.location.search).get('roomId') || 'fixture-room'} onBack={() => {}} /></main>))
}
