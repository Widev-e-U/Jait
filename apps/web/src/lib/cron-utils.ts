/**
 * Common cron expression presets and utilities
 */

export interface CronPreset {
  label: string
  value: string
  description: string
}

export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every minute', value: '* * * * *', description: 'Runs every minute' },
  { label: 'Every 5 minutes', value: '*/5 * * * *', description: 'Runs every 5 minutes' },
  { label: 'Every 15 minutes', value: '*/15 * * * *', description: 'Runs every 15 minutes' },
  { label: 'Every 30 minutes', value: '*/30 * * * *', description: 'Runs every 30 minutes' },
  { label: 'Hourly', value: '0 * * * *', description: 'Runs at the start of every hour' },
  { label: 'Every 2 hours', value: '0 */2 * * *', description: 'Runs every 2 hours' },
  { label: 'Daily at midnight', value: '0 0 * * *', description: 'Runs at 00:00 every day' },
  { label: 'Daily at 9am', value: '0 9 * * *', description: 'Runs at 09:00 every day' },
  { label: 'Daily at 6pm', value: '0 18 * * *', description: 'Runs at 18:00 every day' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0', description: 'Runs at midnight every Sunday' },
  { label: 'Weekly (Monday)', value: '0 9 * * 1', description: 'Runs at 9am every Monday' },
  { label: 'Monthly', value: '0 0 1 * *', description: 'Runs at midnight on the 1st of each month' },
]

/**
 * Parse a cron expression into human-readable format
 */
export function describeCron(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length !== 5) return cron
  
  const [minute, hour, day, month, weekday] = parts
  
  // Check for presets first
  const preset = CRON_PRESETS.find(p => p.value === cron)
  if (preset) return preset.description
  
  // Build description
  const descriptions: string[] = []
  
  // Minute/Hour
  if (minute === '*' && hour === '*') {
    descriptions.push('Every minute')
  } else if (minute.startsWith('*/')) {
    descriptions.push(`Every ${minute.slice(2)} minutes`)
  } else if (hour === '*') {
    descriptions.push(`At minute ${minute} of every hour`)
  } else if (minute === '0') {
    descriptions.push(`At ${hour}:00`)
  } else {
    descriptions.push(`At ${hour}:${minute.padStart(2, '0')}`)
  }
  
  // Day of week
  if (weekday !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayNum = parseInt(weekday)
    if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      descriptions.push(`on ${days[dayNum]}`)
    }
  }
  
  // Day of month
  if (day !== '*') {
    descriptions.push(`on day ${day}`)
  }
  
  // Month
  if (month !== '*') {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December']
    const monthNum = parseInt(month)
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      descriptions.push(`in ${months[monthNum]}`)
    }
  }
  
  return descriptions.join(' ')
}

/**
 * Validate a cron expression
 */
export function validateCron(cron: string): { valid: boolean; error?: string } {
  const parts = cron.trim().split(/\s+/)
  
  if (parts.length !== 5) {
    return { valid: false, error: 'Cron expression must have 5 parts (minute hour day month weekday)' }
  }
  
  const [minute, hour, day, month, weekday] = parts
  
  // Basic validation for each part
  const validators = [
    { name: 'minute', value: minute, min: 0, max: 59 },
    { name: 'hour', value: hour, min: 0, max: 23 },
    { name: 'day', value: day, min: 1, max: 31 },
    { name: 'month', value: month, min: 1, max: 12 },
    { name: 'weekday', value: weekday, min: 0, max: 6 },
  ]
  
  for (const v of validators) {
    if (!isValidCronPart(v.value, v.min, v.max)) {
      return { valid: false, error: `Invalid ${v.name}: ${v.value}` }
    }
  }
  
  return { valid: true }
}

function isValidCronPart(part: string, min: number, max: number): boolean {
  if (part === '*') return true
  
  // Step values: */5
  if (part.startsWith('*/')) {
    const step = parseInt(part.slice(2))
    return !isNaN(step) && step > 0 && step <= max
  }
  
  // Range: 1-5
  if (part.includes('-')) {
    const [start, end] = part.split('-').map(Number)
    return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start <= end
  }
  
  // List: 1,2,3
  if (part.includes(',')) {
    return part.split(',').every(p => {
      const num = parseInt(p)
      return !isNaN(num) && num >= min && num <= max
    })
  }
  
  // Simple number
  const num = parseInt(part)
  return !isNaN(num) && num >= min && num <= max
}

/**
 * Calculate next run time from cron expression
 */
export function getNextRunTime(cron: string): Date | null {
  // Simple next-run calculation (for display purposes)
  // For accurate calculation, use a proper cron library
  try {
    const now = new Date()
    const parts = cron.split(' ')
    if (parts.length !== 5) return null
    
    const [minute, hour] = parts
    
    // For simple cases, calculate next occurrence
    if (minute.startsWith('*/')) {
      const step = parseInt(minute.slice(2))
      const nextMinute = Math.ceil(now.getMinutes() / step) * step
      const next = new Date(now)
      if (nextMinute >= 60) {
        next.setHours(next.getHours() + 1)
        next.setMinutes(nextMinute % 60)
      } else {
        next.setMinutes(nextMinute)
      }
      next.setSeconds(0)
      next.setMilliseconds(0)
      return next
    }
    
    if (minute !== '*' && hour !== '*') {
      const targetMinute = parseInt(minute)
      const targetHour = parseInt(hour)
      const next = new Date(now)
      next.setHours(targetHour)
      next.setMinutes(targetMinute)
      next.setSeconds(0)
      next.setMilliseconds(0)
      
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
      return next
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Format a date as relative time
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMins = Math.round(diffMs / 60000)
  const diffHours = Math.round(diffMs / 3600000)
  const diffDays = Math.round(diffMs / 86400000)
  
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `in ${diffMins}m`
  if (diffHours < 24) return `in ${diffHours}h`
  return `in ${diffDays}d`
}
