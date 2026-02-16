// Time utilities for game time formatting

export function formatGameTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('nb-NO', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  })
}

export function formatGameDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('nb-NO', { 
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export function formatGameDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('nb-NO', { 
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function formatMissionTime(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0s"
  
  // Convert to total seconds for more precise calculation
  const totalSeconds = Math.round(totalMinutes * 60)
  
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  const parts: string[] = []
  
  if (hours > 0) parts.push(`${hours}t`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  
  return parts.join(" ")
}

export function getSpeedMultiplier(speed: 1 | 2 | 3): string {
  switch (speed) {
    case 1: return "1x"
    case 2: return "2x"
    case 3: return "3x"
    default: return "1x"
  }
}
