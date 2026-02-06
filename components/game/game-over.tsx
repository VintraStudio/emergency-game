"use client"

import { Skull, RotateCcw, CheckCircle2, XCircle, DollarSign, Clock } from "lucide-react"
import type { GameState } from "@/lib/game-types"

interface GameOverProps {
  state: GameState
  onReset: () => void
}

export function GameOver({ state, onReset }: GameOverProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="animate-slide-up w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Skull className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="mb-1 text-2xl font-bold text-foreground">Bankruptcy</h2>
          <p className="text-sm text-muted-foreground">
            Your emergency services company has run out of funds.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-lg font-bold text-foreground">{formatTime(state.gameTime)}</div>
            <div className="text-xs text-muted-foreground">Time Survived</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <DollarSign className="mx-auto mb-1 h-4 w-4 text-destructive" />
            <div className="text-lg font-bold text-destructive">
              ${Math.abs(state.money).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">In Debt</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-primary" />
            <div className="text-lg font-bold text-primary">{state.missionsCompleted}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <XCircle className="mx-auto mb-1 h-4 w-4 text-destructive" />
            <div className="text-lg font-bold text-destructive">{state.missionsFailed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </div>

        <button
          onClick={onReset}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    </div>
  )
}
