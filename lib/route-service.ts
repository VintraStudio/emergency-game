import type { LatLng } from "./game-types"

type Key = string
const cache = new Map<Key, LatLng[]>()

const queue: Array<{
  from: LatLng
  to: LatLng
  resolve: (r: LatLng[]) => void
  reject: (e: any) => void
}> = []

let running = false
const CONCURRENCY = 1
let inFlight = 0

const DELAY_MS = 900
const FETCH_TIMEOUT_MS = 6500

function round(n: number, p = 4) {
  const m = Math.pow(10, p)
  return Math.round(n * m) / m
}
function routeKey(from: LatLng, to: LatLng): Key {
  // rounding => cache treffer oftere
  return `${round(from.lat)},${round(from.lng)}->${round(to.lat)},${round(to.lng)}`
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

async function fetchOSRM(from: LatLng, to: LatLng): Promise<LatLng[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const maxRetries = 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)

      if (res.status === 429) {
        // backoff (respekter gjerne Retry-After hvis du vil)
        const backoff = 1200 + attempt * 1200
        await sleep(backoff)
        continue
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined
      if (data.code === "Ok" && coords && coords.length >= 2) {
        return coords.map(([lng, lat]) => ({ lat, lng }))
      }
      throw new Error("No route geometry")
    } catch (e) {
      if (attempt < maxRetries) {
        await sleep(500 + attempt * 800)
        continue
      }
      throw e
    }
  }
  throw new Error("OSRM failed")
}

async function pump() {
  if (running) return
  running = true

  try {
    while (queue.length > 0) {
      if (inFlight >= CONCURRENCY) {
        await sleep(50)
        continue
      }

      const job = queue.shift()!
      inFlight++

      ;(async () => {
        try {
          const k = routeKey(job.from, job.to)
          const cached = cache.get(k)
          if (cached) {
            job.resolve(cached)
            return
          }

          const r = await fetchOSRM(job.from, job.to)
          cache.set(k, r)
          job.resolve(r)
        } catch (e) {
          job.reject(e)
        } finally {
          inFlight--
        }
      })()

      await sleep(DELAY_MS)
    }
  } finally {
    running = false
  }
}

export function getRouteQueued(from: LatLng, to: LatLng): Promise<LatLng[]> {
  const k = routeKey(from, to)
  const cached = cache.get(k)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve, reject) => {
    queue.push({ from, to, resolve, reject })
    pump()
  })
}
