/**
 * Route Cache and Rate Limiting System
 * Handles OSRM caching, retry logic, and graceful fallback routing
 */

import type { LatLng } from "./game-types"

interface CachedRoute {
  points: LatLng[]
  timestamp: number
  hits: number
}

class RouteCacheManager {
  private cache: Map<string, CachedRoute> = new Map()
  private requestQueue: Array<{ key: string; resolve: Function; reject: Function; time: number }> = []
  private activeRequests = 0
  private maxConcurrent = 2
  private minIntervalMs = 500
  private lastRequestTime = 0
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  /**
   * Generate cache key from coordinates
   */
  private getCacheKey(from: LatLng, to: LatLng): string {
    const fromKey = `${Math.round(from.lat * 1000)},${Math.round(from.lng * 1000)}`
    const toKey = `${Math.round(to.lat * 1000)},${Math.round(to.lng * 1000)}`
    return `route:${fromKey}->${toKey}`
  }

  /**
   * Fetch route with caching and rate limiting
   */
  async getRoute(from: LatLng, to: LatLng): Promise<LatLng[]> {
    const key = this.getCacheKey(from, to)

    // Check cache first
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      cached.hits++
      return cached.points
    }

    // Queue request
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ key, resolve, reject, time: Date.now() })
      this.processQueue()
    })
  }

  /**
   * Process queued requests with rate limiting
   */
  private async processQueue() {
    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
      // Enforce minimum interval between requests
      const timeSinceLastRequest = Date.now() - this.lastRequestTime
      if (timeSinceLastRequest < this.minIntervalMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - timeSinceLastRequest))
      }

      const request = this.requestQueue.shift()
      if (!request) break

      this.activeRequests++
      this.lastRequestTime = Date.now()

      try {
        const points = await this.fetchFromOSRM(request.key)
        
        // Cache successful result
        this.cache.set(request.key, {
          points,
          timestamp: Date.now(),
          hits: 0,
        })

        request.resolve(points)
      } catch (error) {
        request.reject(error)
      } finally {
        this.activeRequests--
        this.processQueue()
      }
    }
  }

  /**
   * Fetch from OSRM with retry logic
   */
  private async fetchFromOSRM(key: string, retries = 2): Promise<LatLng[]> {
    const [from, to] = this.parseKey(key)
    if (!from || !to) return []

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (!res.ok) {
          if (res.status === 429) {
            // Rate limited - wait before retrying
            if (attempt < retries) {
              await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
              continue
            }
          }
          return []
        }

        const data = await res.json()
        if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates?.length >= 2) {
          return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }))
        }

        return []
      } catch (error) {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
          continue
        }
        return []
      }
    }

    return []
  }

  /**
   * Parse cache key back to coordinates
   */
  private parseKey(key: string): [LatLng | null, LatLng | null] {
    const match = key.match(/route:(-?\d+),(-?\d+)->(-?\d+),(-?\d+)/)
    if (!match) return [null, null]
    
    return [
      { lat: parseInt(match[1]) / 1000, lng: parseInt(match[2]) / 1000 },
      { lat: parseInt(match[3]) / 1000, lng: parseInt(match[4]) / 1000 },
    ]
  }

  /**
   * Clear old cache entries
   */
  clearExpiredCache() {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      queuedRequests: this.requestQueue.length,
      activeRequests: this.activeRequests,
    }
  }
}

// Global instance
const routeCache = new RouteCacheManager()

// Periodic cache cleanup
setInterval(() => routeCache.clearExpiredCache(), 60000)

/**
 * Get route with caching and rate limiting
 */
export async function getCachedRoute(from: LatLng, to: LatLng): Promise<LatLng[]> {
  return routeCache.getRoute(from, to)
}

/**
 * Get cache statistics
 */
export function getRouteCacheStats() {
  return routeCache.getStats()
}
