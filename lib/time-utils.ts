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

export function formatMissionTime(minutes: number): string {
  if (minutes <= 0) return "0 min"
  if (minutes < 60) return `${minutes} min`
  
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}t ${mins}min` : `${hours}t`
}

export function getSpeedMultiplier(speed: 1 | 2 | 3): string {
  switch (speed) {
    case 1: return "1x"
    case 2: return "2x"
    case 3: return "3x"
    default: return "1x"
  }
}
