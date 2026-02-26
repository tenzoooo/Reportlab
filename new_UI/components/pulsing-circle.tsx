"use client"

import { PulsingBorder } from "@paper-design/shaders-react"

export default function PulsingCircle() {
  return (
    <div className="absolute bottom-8 right-8 z-30">
      <PulsingBorder
        colors={["#BEECFF", "#E77EDC", "#FF4C3E", "#00FF88", "#FFD700"]}
        colorBack="#00000000"
        speed={1.5}
        roundness={1}
        thickness={0.1}
        softness={0.2}
        intensity={0.5}
        spots={5}
        spotSize={0.5}
        pulse={0.25}
        smoke={0.3}
        smokeSize={0.6}
        scale={0.65}
        style={{
          width: "60px",
          height: "60px",
          borderRadius: "50%",
        }}
      />
    </div>
  )
}
