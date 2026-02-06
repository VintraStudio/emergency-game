"use client"

import { Siren, Play, Building2, DollarSign, Zap } from "lucide-react"

interface StartScreenProps {
  onStart: () => void
}

export function StartScreen({ onStart }: StartScreenProps) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="w-full max-w-lg px-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
            <Siren className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-foreground">
            Emergency<span className="text-primary">City</span>
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Build and manage emergency services for your city. 
            Place buildings, dispatch vehicles, and respond to crises before time runs out.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <DollarSign className="mx-auto mb-2 h-5 w-5 text-primary" />
            <div className="text-lg font-bold text-foreground">$20,000</div>
            <div className="text-xs text-muted-foreground">Starting Funds</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Building2 className="mx-auto mb-2 h-5 w-5 text-accent" />
            <div className="text-lg font-bold text-foreground">7</div>
            <div className="text-xs text-muted-foreground">Building Types</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Zap className="mx-auto mb-2 h-5 w-5 text-destructive" />
            <div className="text-lg font-bold text-foreground">125K</div>
            <div className="text-xs text-muted-foreground">Population</div>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">How to Play</h3>
          <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
              Place emergency buildings on the map using the Build panel
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
              Respond to missions by dispatching vehicles from your stations
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
              Earn money from completed missions, upgrade your buildings
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">4</span>
              {"Don't go bankrupt - sell buildings if funds get low!"}
            </li>
          </ul>
        </div>

        <button
          onClick={onStart}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
        >
          <Play className="h-4 w-4" />
          Start New Game
        </button>
      </div>
    </div>
  )
}
