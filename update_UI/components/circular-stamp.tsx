"use client"

export default function CircularStamp() {
  const text = "Reportlab — Build your lab report faster — "

  return (
    <div className="absolute bottom-8 right-8 z-20 hidden md:block opacity-40">
      <div className="relative w-28 h-28">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full animate-spin"
          style={{ animationDuration: "20s" }}
        >
          <defs>
            <path
              id="circlePath"
              d="M 50, 50 m -37, 0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0"
            />
          </defs>
          <text className="fill-white text-[8px] font-light tracking-widest uppercase">
            <textPath href="#circlePath" startOffset="0%">
              {text}
            </textPath>
          </text>
        </svg>
        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/20" />
      </div>
    </div>
  )
}
