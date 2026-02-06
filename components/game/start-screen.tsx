"use client"

import { useState } from "react"
import { Siren, Play, MapPin, Users, Check } from "lucide-react"
import type { CityConfig } from "@/lib/game-types"
import { CITY_OPTIONS } from "@/lib/game-types"

interface StartScreenProps {
  onStart: (city: CityConfig) => void
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [selectedCity, setSelectedCity] = useState<CityConfig>(CITY_OPTIONS[0])

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="w-full max-w-lg px-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Siren className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-foreground">
            Emergency<span className="text-primary">City</span>
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Build and manage emergency services in a real city.
            Place buildings, dispatch vehicles along actual roads, and respond to crises.
          </p>
        </div>

        {/* City Selection */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Choose Your City</h3>
          <div className="grid grid-cols-2 gap-2">
            {CITY_OPTIONS.map((city) => {
              const isSelected = selectedCity.id === city.id
              return (
                <button
                  key={city.id}
                  onClick={() => setSelectedCity(city)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    isSelected
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card hover:border-primary/30 hover:bg-secondary/60"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? "bg-primary/20" : "bg-secondary"
                    }`}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {city.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{city.country}</span>
                      <span className="text-border">|</span>
                      <Users className="h-3 w-3" />
                      <span>{(city.population / 1000).toFixed(0)}K</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* How to Play */}
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">How to Play</h3>
          <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
              Place emergency buildings on the real city map
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
              Respond to missions by dispatching vehicles from your stations
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
              Vehicles follow real roads to reach emergencies via OSRM routing
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">4</span>
              {"Don't go bankrupt -- manage your budget carefully!"}
            </li>
          </ul>
        </div>

        <button
          onClick={() => onStart(selectedCity)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
        >
          <Play className="h-4 w-4" />
          Start in {selectedCity.name}
        </button>
      </div>
    </div>
  )
}
