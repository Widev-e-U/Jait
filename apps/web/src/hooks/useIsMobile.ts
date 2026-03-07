import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const getIsMobile = () => window.innerWidth < MOBILE_BREAKPOINT
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}
