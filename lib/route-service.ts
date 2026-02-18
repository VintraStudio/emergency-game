// route-service.ts
export type LatLng = { lat: number; lng: number }

type RouteResult = LatLng[]

const OSRM_BASE = "https://router.project-osrm.org"
const PROFILE = "driving"

// Global throttle (viktig: både NPC + units går gjennom samme kø)
const MAX_CONCURRENCY = 2

// Hard timeout per request (demo-OSRM trenger dette)
const REQUEST_TIMEOUT_MS = 6500

// Retries (med backoff)
const MAX_RETRIES = 2

// Cache (hindrer spam av samme rute)
const CACHE_TTL_MS = 5 * 60 * 1000

// Circuit breaker: hvis OSRM feiler mye, bruk fallback en periode
const BREAKER_FAIL_THRESHOLD = 6
const BREAKER_COOLDOWN_MS = 60 * 1000

// ---------------- internals ----------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function quantize(n: number, digits = 5) {
  const p = Math.pow(10, digits)
  return Math.round(n * p) / p
}

function keyFor(from: LatLng, to: LatLng) {
  // kvantiser for bedre cache-hit
  const a = `${quantize(from.lat)},${quantize(from.lng)}`
  const b = `${quantize(to.lat)},${quantize(to.lng)}`
  return `${a}|${b}`
}

// Enkel concurrency queue
let active = 0
const queue: Array<() => void> = []

async function withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => queue.push(resolve))
  }
  active++
  try {
    return await fn()
  } finally {
    active--
    const next = queue.shift()
    if (next) next()
  }
}

// Cache + in-flight dedupe
const cache = new Map<string, { at: number; route: RouteResult }>()
const inFlight = new Map<string, Promise<RouteResult>>()

// Circuit breaker state
let breakerFails = 0
let breakerOpenUntil = 0

function breakerOpen() {
  return Date.now() < breakerOpenUntil
}
function recordFail() {
  breakerFails++
  if (breakerFails >= BREAKER_FAIL_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS
    breakerFails = 0
  }
}
function recordSuccess() {
  breakerFails = 0
}

// Fallback: samme som din interpolateRoute, men lagt her for gjenbruk
export function interpolateRoute(from: LatLng, to: LatLng): LatLng[] {
  const steps = 30
  const points: LatLng[] = []
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  const len = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001
  const perpLat = -dLng / len
  const perpLng = dLat / len
  const jitterScale = len * 0.08

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const envelope = Math.sin(Math.PI * t)
    const jitter = (Math.random() - 0.5) * jitterScale * envelope
    points.push({
      lat: from.lat + dLat * t + perpLat * jitter,
      lng: from.lng + dLng * t + perpLng * jitter,
    })
  }
  return points
}

async function fetchOsrm(from: LatLng, to: LatLng): Promise<RouteResult> {
  const url =
    `${OSRM_BASE}/route/v1/${PROFILE}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson`

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const coords = data?.routes?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return []
    return coords.map(([lng, lat]: [number, number]) => ({ lat, lng }))
  } finally {
    clearTimeout(t)
  }
}

async function fetchWithRetry(from: LatLng, to: LatLng): Promise<RouteResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const route = await fetchOsrm(from, to)
      if (route.length >= 2) return route
      throw new Error("Empty route")
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e
      // exponential backoff + jitter
      const backoff = 450 * Math.pow(2, attempt) + Math.random() * 250
      await sleep(backoff)
    }
  }
  return []
}

/**
 * Main API:
 * - global concurrency limit
 * - cache + inflight dedupe
 * - circuit breaker
 * - fallback interpolation if OSRM is down
 */
export async function getRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  const k = keyFor(from, to)

  // Cache hit
  const cached = cache.get(k)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.route
  }

  // If breaker open: don’t even try OSRM
  if (breakerOpen()) {
    return interpolateRoute(from, to)
  }

  // Inflight dedupe
  const existing = inFlight.get(k)
  if (existing) return existing

  const p = withConcurrency(async () => {
    try {
      const route = await fetchWithRetry(from, to)
      recordSuccess()
      cache.set(k, { at: Date.now(), route })
      return route
    } catch {
      recordFail()
      return interpolateRoute(from, to)
    } finally {
      inFlight.delete(k)
    }
  })

  inFlight.set(k, p)
  return p
}
