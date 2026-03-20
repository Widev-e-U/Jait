import { useEffect, useState } from 'react'
import { detectMobileViewport } from '@/lib/device-layout'

export function useIsMobile() {
  const getIsMobile = () => detectMobileViewport()
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}
