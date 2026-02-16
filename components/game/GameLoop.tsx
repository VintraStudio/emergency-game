"use client"

import { useEffect } from "react"
import { useGameState, useGameActions } from "@/lib/game-store"

export function GameLoop() {
  const { isPaused, gameOver } = useGameState()
  const { tick } = useGameActions() // ✅ hent bare tick (stabil useCallback)

  useEffect(() => {
    if (isPaused || gameOver) return

    const id = setInterval(() => {
      tick()
    }, 200) // 200ms for smooth relaxed movement

    return () => clearInterval(id)
  }, [isPaused, gameOver, tick]) // ✅ IKKE actions

  return null
}
