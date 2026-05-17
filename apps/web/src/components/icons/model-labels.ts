export function formatModelDisplayLabel(model: string): string {
  return model.trim().replace(/\s*\[([^\]]+)\]\s*$/, ' ($1)')
}
