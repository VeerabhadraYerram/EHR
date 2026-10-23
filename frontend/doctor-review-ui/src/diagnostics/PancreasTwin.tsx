export function PancreasArtwork({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 420 180"
      role="img"
      aria-label="Schematic pancreas with head, body, tail and pancreatic duct"
      className="dx-pancreas-art"
    >
      <path
        d="M69 62C42 46 28 65 32 93C27 114 42 137 62 132C79 149 99 135 104 116C131 115 148 109 165 101C197 108 220 96 237 88C260 95 281 78 293 72C322 78 346 59 365 51C384 45 389 26 376 28C352 27 341 40 325 38C306 30 287 45 270 47C249 39 230 53 214 57C191 51 177 69 158 69C136 57 121 81 105 78C94 56 80 50 69 62Z"
        fill="#8adbd226"
        stroke="#8adbd2"
        strokeWidth="1.5"
      />
      <path
        d="M65 119Q76 98 99 96T159 87T218 76T280 61T367 39"
        fill="none"
        stroke="#a3e3dc"
        strokeWidth="1.7"
      />
      {[75, 108, 143, 178, 212, 248, 281, 315, 347].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${104 - i * 7}q-10 -13 0 -27m0 27q12 5 13 16`}
          fill="none"
          stroke="#88c8c5"
          strokeWidth=".65"
          opacity=".65"
        />
      ))}
      <circle
        cx="192"
        cy="83"
        r="13"
        fill="#69dac333"
        stroke="#7ddac9"
        strokeDasharray="2 3"
      />
      {!compact && (
        <g fill="#b7cdd4" fontSize="11" fontFamily="monospace">
          <text x="39" y="164">
            HEAD
          </text>
          <text x="168" y="138">
            BODY
          </text>
          <text x="345" y="86">
            TAIL
          </text>
          <path d="M191 100V119M359 57V72" stroke="#698c95" />
        </g>
      )}
    </svg>
  );
}
