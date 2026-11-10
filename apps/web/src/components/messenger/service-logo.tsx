import type { IconType } from 'react-icons'
import { BsMicrosoftTeams } from 'react-icons/bs'
import { FaSlack, FaWhatsapp } from 'react-icons/fa'
import { SiDiscord, SiMatrix, SiSignal, SiTelegram } from 'react-icons/si'

/** Provider brand glyphs from react-icons: a white mark on a solid brand-coloured tile. */
const LOGOS: Record<string, { Icon: IconType; color: string }> = {
  WhatsApp: { Icon: FaWhatsapp, color: '#25D366' },
  Teams: { Icon: BsMicrosoftTeams, color: '#5059C9' },
  Telegram: { Icon: SiTelegram, color: '#229ED9' },
  Signal: { Icon: SiSignal, color: '#3A76F0' },
  Discord: { Icon: SiDiscord, color: '#5865F2' },
  Slack: { Icon: FaSlack, color: '#4A154B' },
  Matrix: { Icon: SiMatrix, color: '#0DBD8B' },
}

export function hasServiceLogo(service: string): boolean {
  return service in LOGOS
}

export function ServiceLogo({ service, className }: { service: string; className?: string }) {
  const logo = LOGOS[service]
  if (!logo) return null
  return <span role="img" aria-label={service} className={'grid place-items-center text-white ' + (className ?? '')} style={{ backgroundColor: logo.color }}>
    <logo.Icon className="size-[62%]" />
  </span>
}
