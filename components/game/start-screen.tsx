"use client"

import { useState } from "react"
import { Siren, Play, MapPin, Users, Check } from "lucide-react"
import type { CityConfig } from "@/lib/game-types"
import { CITY_OPTIONS } from "@/lib/game-types"
import "./start-screen.css"

interface StartScreenProps {
  onStart: (city: CityConfig) => void
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [selectedCity, setSelectedCity] = useState<CityConfig>(CITY_OPTIONS[0])

  return (
    <div className="start-screen">
      <div className="start-screen-container">
        <div className="start-screen-header">
          <div className="start-screen-icon">
            <Siren className="w-8 h-8 text-primary" />
          </div>
          <h1 className="start-screen-title">
            Emergency<span className="highlight">City</span>
          </h1>
          <p className="start-screen-subtitle">
            Build and manage emergency services in a real city. Place buildings, dispatch vehicles along actual roads, and respond to crises.
          </p>
        </div>

        <div className="city-selection">
          <h2 className="city-selection-title">Choose Your City</h2>
          <div className="city-grid">
            {CITY_OPTIONS.map((city) => {
              const isSelected = selectedCity.id === city.id
              return (
                <button
                  key={city.id}
                  onClick={() => setSelectedCity(city)}
                  className={`city-card ${isSelected ? "selected" : ""}`}
                >
                  <div className="city-icon">
                    {isSelected ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <MapPin className="w-4 h-4" />
                    )}
                  </div>
                  <div className="city-info">
                    <div className="city-name">{city.name}</div>
                    <div className="city-details">
                      <span className="city-country">{city.country}</span>
                      <span className="city-separator">|</span>
                      <div className="city-population">
                        <Users className="population-icon" />
                        <span>{(city.population / 1000).toFixed(0)}K</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="how-to-play">
          <h2 className="how-to-play-title">How to Play</h2>
          <ul className="how-to-play-list">
            <li className="how-to-play-item">
              <span className="step-number">1</span>
              <span className="step-text">Place emergency buildings on the real city map</span>
            </li>
            <li className="how-to-play-item">
              <span className="step-number">2</span>
              <span className="step-text">Respond to missions by dispatching vehicles from your stations</span>
            </li>
            <li className="how-to-play-item">
              <span className="step-number">3</span>
              <span className="step-text">Vehicles follow real roads to reach emergencies via OSRM routing</span>
            </li>
            <li className="how-to-play-item">
              <span className="step-number">4</span>
              <span className="step-text">Don't go bankrupt -- manage your budget carefully!</span>
            </li>
          </ul>
        </div>

        <button
          onClick={() => onStart(selectedCity)}
          className="start-button"
        >
          <Play className="play-icon" />
          Start in {selectedCity.name}
        </button>
      </div>
    </div>
  )
}
