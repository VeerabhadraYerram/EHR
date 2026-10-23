import { useId } from "react";

export function BrainMap({ compact = false }: { compact?: boolean }) {
  const id = useId().replaceAll(":", "");
  const outline =
    "M65 131C35 119 32 87 51 72C46 50 67 33 89 35C103 15 125 20 137 27C153 9 180 20 185 33C212 22 239 43 237 62C263 69 270 91 258 108C276 135 257 159 240 161C234 183 213 193 194 182C175 197 152 186 146 179C121 194 101 179 99 167C77 174 58 155 65 131Z";
  return (
    <svg
      viewBox="0 0 310 220"
      className="dx-brain"
      role="img"
      aria-label="Illustrative cortical brain reconstruction"
    >
      <defs>
        <clipPath id={id}>
          <path d={outline} />
        </clipPath>
        <radialGradient id={`${id}fill`}>
          <stop stopColor="#267384" stopOpacity=".6" />
          <stop offset="1" stopColor="#0c3445" stopOpacity=".4" />
        </radialGradient>
      </defs>
      <ellipse
        cx="154"
        cy="114"
        rx="137"
        ry="74"
        transform="rotate(-17 154 114)"
        fill="none"
        stroke="#36515c"
        strokeWidth=".5"
      />
      <path
        d={outline}
        fill={`url(#${id}fill)`}
        stroke="#66c8cd"
        strokeOpacity=".7"
        strokeWidth="1.3"
      />
      <g
        clipPath={`url(#${id})`}
        fill="none"
        stroke="#76ced0"
        strokeOpacity=".4"
        strokeWidth=".8"
      >
        {Array.from({ length: 13 }, (_, i) => (
          <path
            key={i}
            d={`M${42 + i * 17} 20C${95 + i * 10} 58 ${8 + i * 20} 67 ${65 + i * 15} 99S${48 + i * 19} 140 ${79 + i * 15} 191`}
          />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <path
            key={i}
            d={`M35 ${40 + i * 20}C92 ${19 + i * 19} 90 ${82 + i * 11} 152 ${45 + i * 18}S239 ${35 + i * 23} 278 ${62 + i * 16}`}
          />
        ))}
      </g>
      <path
        d="M157 30C141 56 164 76 151 102S175 146 157 180"
        stroke="#82dbd6"
        fill="none"
        opacity=".6"
      />
      <path
        d="M205 160C244 146 262 177 234 196C216 212 193 194 195 181"
        fill="#164554"
        stroke="#4d9f9f"
        strokeWidth=".8"
      />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M204 ${172 + i * 5}Q226 ${162 + i * 5} 243 ${177 + i * 4}`}
          fill="none"
          stroke="#5db6b6"
          opacity=".6"
          strokeWidth=".7"
        />
      ))}
      <path
        d="M199 183L210 211L221 212L216 190"
        fill="#1c5260"
        stroke="#57b2b1"
        strokeWidth=".6"
      />
      {!compact && (
        <g className="dx-svg-label">
          <path
            d="M65 93L26 79H6M245 163L280 181H305"
            fill="none"
            stroke="#5b969d"
            strokeWidth=".7"
          />
          <circle cx="65" cy="93" r="2" fill="#7edbd2" />
          <circle cx="245" cy="163" r="2" fill="#7edbd2" />
          <text x="5" y="70">
            CORTEX
          </text>
          <text x="269" y="195">
            CEREBELLUM
          </text>
        </g>
      )}
    </svg>
  );
}

export function BrainSlice({
  plane,
  active = false,
}: {
  plane: "axial" | "coronal" | "sagittal";
  active?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 120"
      role="img"
      aria-label={`${plane} illustrative MRI slice`}
    >
      <rect
        x="3"
        y="3"
        width="94"
        height="114"
        rx="4"
        fill="#07121d"
        stroke={active ? "#3c8c98" : "#193441"}
      />
      <path
        d="M9 17V9H18M82 9H91V17M9 102V110H18M82 110H91V102"
        stroke="#2e5665"
        strokeWidth=".6"
        fill="none"
      />
      {plane === "sagittal" ? (
        <>
          <path
            d="M29 86C12 59 21 26 51 25C82 26 88 53 73 72L61 89L59 105L47 102L44 84Z"
            fill="#2c6577"
            stroke="#548fa0"
          />
          <path
            d="M29 69C17 43 42 25 63 35C81 45 68 63 54 65L45 78"
            fill="#5a91a0"
            opacity=".6"
          />
          <path
            d="M36 57C36 37 59 39 64 50L56 59L49 55L45 65"
            fill="none"
            stroke="#9bd2d0"
            strokeWidth="4"
          />
          <path d="M60 70Q84 63 75 87L60 87Z" fill="#458090" />
        </>
      ) : (
        <>
          <ellipse
            cx="50"
            cy="63"
            rx="30"
            ry="41"
            fill="#234e60"
            stroke="#5b97a6"
            strokeWidth="1"
          />
          <ellipse cx="50" cy="63" rx="24" ry="35" fill="#507d8e" />
          {[-1, 1].map((sign) => (
            <path
              key={sign}
              d={`M50 30C${50 + sign * 23} 29 ${50 + sign * 28} 68 ${50 + sign * 14} 94Q${50 + sign * 4} 101 50 88V30Z`}
              fill="#7ea7ae"
              opacity=".5"
            />
          ))}
          <path
            d={
              plane === "axial"
                ? "M42 52L49 63L43 78L50 73L57 78L52 63L59 52L50 57Z"
                : "M37 50Q49 48 49 62L43 79L50 72L57 79L52 62Q53 49 64 50L59 64L50 67L41 64Z"
            }
            fill="#092837"
            stroke="#346170"
            strokeWidth=".8"
          />
          <path d="M50 27V99" stroke="#0b3443" strokeWidth="1.2" />
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse
              key={i}
              cx="50"
              cy={43 + i * 7}
              rx={20 - Math.abs(i - 2) * 2}
              ry="4"
              fill="none"
              stroke="#9fc7c8"
              strokeWidth=".6"
              opacity=".3"
            />
          ))}
        </>
      )}
      <text x="9" y="16" className="dx-svg-micro">
        {plane === "axial" ? "A" : plane === "coronal" ? "S" : "R"}
      </text>
    </svg>
  );
}

export function Thorax() {
  return (
    <svg
      viewBox="0 0 195 205"
      role="img"
      aria-label="Illustrative thoracic radiograph"
    >
      <defs>
        <radialGradient id="thorax-fill">
          <stop stopColor="#387b87" stopOpacity=".3" />
          <stop offset="1" stopColor="#102631" stopOpacity=".1" />
        </radialGradient>
      </defs>
      <rect
        x="5"
        y="5"
        width="185"
        height="195"
        rx="4"
        fill="#07141e"
        stroke="#183744"
      />
      <path
        d="M30 165L36 65Q48 27 78 28H117Q148 27 158 65L164 165"
        fill="url(#thorax-fill)"
        stroke="#426d7a"
        strokeWidth=".9"
      />
      <path
        d="M46 162Q30 77 80 51L85 162ZM110 51Q163 77 147 162H106Z"
        fill="#1b505e"
        fillOpacity=".7"
        stroke="#3c7a84"
        strokeWidth="1"
      />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i}>
          <path
            d={`M94 ${44 + i * 10}Q${50 - i * 0.3} ${18 + i * 12} ${39 - i * 0.3} ${65 + i * 10}Q57 ${84 + i * 9} 94 ${52 + i * 10}`}
            stroke="#87c6c6"
            strokeWidth="1"
            fill="none"
            opacity=".8"
          />
          <path
            d={`M101 ${44 + i * 10}Q${145 + i * 0.3} ${18 + i * 12} ${156 + i * 0.3} ${65 + i * 10}Q138 ${84 + i * 9} 101 ${52 + i * 10}`}
            stroke="#87c6c6"
            strokeWidth="1"
            fill="none"
            opacity=".8"
          />
          <rect
            x="94"
            y={20 + i * 13}
            width="7"
            height="9"
            rx="1"
            fill="#78b9b9"
            opacity=".65"
          />
        </g>
      ))}
      <path
        d="M65 30Q75 44 96 42Q121 42 134 30M94 22V9M101 22V9"
        stroke="#a4d5d4"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M105 87C120 75 131 96 128 115L112 143L94 126L92 104Z"
        fill="#518894"
        opacity=".5"
      />
      <text x="13" y="19" className="dx-svg-label">
        R
      </text>
      <text x="174" y="19" className="dx-svg-label">
        L
      </text>
    </svg>
  );
}

export function DnaHelix({ active = 0 }: { active?: number }) {
  const points = Array.from({ length: 91 }, (_, i) => {
    const t = i / 90;
    return { x: 64 + Math.sin(t * Math.PI * 7) * 34, y: 12 + t * 190 };
  });
  const path = (opposite = false) =>
    points
      .map((p, i) => `${i ? "L" : "M"}${opposite ? 128 - p.x : p.x},${p.y}`)
      .join(" ");
  return (
    <svg
      viewBox="0 0 132 215"
      className="dx-dna"
      role="img"
      aria-label="Illustrative DNA double helix"
    >
      <path d={path()} stroke="#65d0c4" strokeWidth="1.7" fill="none" />
      <path d={path(true)} stroke="#48a7c0" strokeWidth="1.7" fill="none" />
      {points
        .filter((_, i) => i % 3 === 0)
        .map((p, i) => (
          <g key={i} opacity={i === active ? 1 : 0.65}>
            <line
              x1={p.x}
              x2={128 - p.x}
              y1={p.y}
              y2={p.y}
              stroke={i % 2 ? "#69d9c5" : "#4a9db9"}
              strokeWidth={i === active ? 2 : 1}
              strokeDasharray="2 2"
            />
            <circle cx={p.x} cy={p.y} r="1.8" fill="#87e1d0" />
            <circle cx={128 - p.x} cy={p.y} r="1.8" fill="#74c6cb" />
          </g>
        ))}
    </svg>
  );
}

export function MriScanner() {
  return (
    <svg
      viewBox="0 0 210 150"
      role="img"
      aria-label="Illustrative isometric MRI scanner"
    >
      <path
        d="M32 21L63 8L110 30L111 107L81 124L32 101Z"
        fill="#0d293a"
        stroke="#3a7c8c"
      />
      <path d="M32 21L81 43L110 30M81 43V124" stroke="#43879a" fill="none" />
      <ellipse
        cx="57"
        cy="68"
        rx="25"
        ry="40"
        fill="#0b1f2b"
        stroke="#428a99"
      />
      <ellipse
        cx="57"
        cy="68"
        rx="18"
        ry="31"
        fill="#04101a"
        stroke="#215967"
      />
      <ellipse
        cx="57"
        cy="68"
        rx="12"
        ry="24"
        fill="none"
        stroke="#62b9b2"
        strokeWidth="1.2"
      />
      <path
        d="M58 90L105 103L165 123L145 135L58 103Z"
        fill="#214b5b"
        stroke="#408d99"
      />
      <path
        d="M58 90L145 120L165 123L145 135L58 103M145 120V135M103 105L101 128L142 142L144 128"
        fill="none"
        stroke="#4e9f9f"
      />
      <path
        d="M30 110L14 120L87 149L183 134L112 107"
        fill="none"
        stroke="#2a6071"
      />
      <path
        d="M41 19L86 39M42 25L77 42M36 106L78 125"
        stroke="#80bec2"
        strokeWidth=".5"
      />
    </svg>
  );
}

export function BodyFallback() {
  return (
    <svg viewBox="0 0 250 650" aria-label="Illustrative skeleton" role="img">
      <g fill="none" stroke="#6dc8c9" strokeWidth="1.1">
        <ellipse cx="125" cy="46" rx="24" ry="32" />
        <path d="M108 72V93L70 108L51 221L36 302M142 72V93L180 108L199 221L214 302M70 108L84 253L82 289L72 448L69 600L93 607L108 452L116 320H134L142 452L157 607L181 600L178 448L168 289L166 253L180 108" />
        {Array.from({ length: 13 }, (_, i) => (
          <g key={i}>
            <path
              d={`M122 ${110 + i * 9}Q${71 + i * 0.5} ${88 + i * 11} ${82 + i * 0.7} ${135 + i * 8}Q95 ${150 + i * 7} 122 ${116 + i * 9}`}
            />
            <path
              d={`M128 ${110 + i * 9}Q${179 - i * 0.5} ${88 + i * 11} ${168 - i * 0.7} ${135 + i * 8}Q155 ${150 + i * 7} 128 ${116 + i * 9}`}
            />
          </g>
        ))}
        <path d="M125 78V312M87 253Q125 279 163 253L168 289L137 316H113L82 289Z" />
        {Array.from({ length: 23 }, (_, i) => (
          <rect key={i} x="121" y={85 + i * 9} width="8" height="5" />
        ))}
        <path d="M72 448L82 448M168 448L178 448M54 221L48 288M196 221L202 288" />
      </g>
    </svg>
  );
}
