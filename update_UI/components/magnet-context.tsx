"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface MagnetPoint {
  id: string
  x: number
  y: number
  isHovered: boolean
}

interface MagnetContextType {
  magnetPoints: Record<string, MagnetPoint>
  registerPoint: (id: string, x: number, y: number, isHovered: boolean) => void
  unregisterPoint: (id: string) => void
}

const MagnetContext = createContext<MagnetContextType | undefined>(undefined)

export function MagnetProvider({ children }: { children: ReactNode }) {
  const [magnetPoints, setMagnetPoints] = useState<Record<string, MagnetPoint>>({})

  const registerPoint = useCallback((id: string, x: number, y: number, isHovered: boolean) => {
    setMagnetPoints((prev) => ({ ...prev, [id]: { id, x, y, isHovered } }))
  }, [])

  const unregisterPoint = useCallback((id: string) => {
    setMagnetPoints((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  return (
    <MagnetContext.Provider value={{ magnetPoints, registerPoint, unregisterPoint }}>
      {children}
    </MagnetContext.Provider>
  )
}

export function useMagnet() {
  const context = useContext(MagnetContext)
  if (context === undefined) {
    return { magnetPoints: {}, registerPoint: () => {}, unregisterPoint: () => {} }
  }
  return context
}
