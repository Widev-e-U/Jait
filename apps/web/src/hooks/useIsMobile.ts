import { useEffect, useState } from 'react'
import { detectMobileViewport } from '@/lib/device-layout'

export function useIsMobile() {
  const getIsMobile = () => {
    // Guard for environments without a DOM (SSR, tests). A non-browser
    // environment cannot be "mobile" by viewport/UA detection.
    if (typeof window === 'undefined') return false
    return detectMobileViewport()
  }
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}
