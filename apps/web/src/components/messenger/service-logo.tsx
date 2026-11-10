/**
 * Provider brand icons, served as full-colour PNGs from /service-icons.
 * Artwork comes from the Iconify "logos" set (@iconify-json/logos); Matrix uses its Simple Icons mark.
 */
const ICONS = new Set(['WhatsApp', 'Teams', 'Matrix', 'Telegram', 'Signal', 'Discord', 'Slack'])

export function hasServiceLogo(service: string): boolean {
  return ICONS.has(service)
}

export function ServiceLogo({ service, className }: { service: string; className?: string }) {
  if (!ICONS.has(service)) return null
  return <img src={`/service-icons/${service.toLowerCase()}.png`} alt={service} draggable={false} className={'object-contain ' + (className ?? '')} />
}
