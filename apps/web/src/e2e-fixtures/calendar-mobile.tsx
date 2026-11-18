import { createRoot } from 'react-dom/client'
import { CalendarPage } from '@/components/calendar/CalendarPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

createRoot(document.getElementById('root')!).render(<TooltipProvider><CalendarPage /></TooltipProvider>)
