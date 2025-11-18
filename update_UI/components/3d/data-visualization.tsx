"use client"

import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Environment } from "@react-three/drei"
import type * as THREE from "three"

function DataBars() {
  const groupRef = useRef<THREE.Group>(null)
  const data = [0.5, 0.8, 0.6, 0.9, 0.7, 0.85, 0.75]

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.2
    }
  })

  return (
    <group ref={groupRef}>
      {data.map((height, i) => (
        <mesh key={i} position={[(i - 3) * 0.6, height, 0]}>
          <boxGeometry args={[0.4, height * 2, 0.4]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#3B82F6" : "#8B5CF6"} roughness={0.3} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

export default function DataVisualization() {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 2, 8], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, 5, -5]} intensity={0.8} color="#8B5CF6" />
        <DataBars />
        <Environment preset="sunset" />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  )
}
