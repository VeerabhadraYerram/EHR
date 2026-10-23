import { useState } from "react";
import { BrainMap } from "./MedicalVisuals";
import { PancreasArtwork } from "./PancreasTwin";

import { organInfo } from "./organDefinitions";
import type { Organ } from "./organDefinitions";

export function OrganVisual({ organ }: { organ: Organ }) {
  const [failed, setFailed] = useState(false);
  if (!failed)
    return (
      <img
        className="ot-organ-artwork"
        src={`/diagnostics/${organ === "brain" ? "brain" : `${organ}-atlas`}.png`}
        alt={`Illustrative ${organInfo[organ].name.toLowerCase()} anatomy; not a patient-specific reconstruction`}
        onError={() => setFailed(true)}
      />
    );
  if (organ === "pancreas") return <PancreasArtwork />;
  if (organ === "brain") return <BrainMap compact />;
  if (organ === "heart")
    return (
      <svg
        viewBox="0 0 320 240"
        role="img"
        aria-label="Schematic heart anatomy"
      >
        <g fill="#8adbd218" stroke="#8adbd2" strokeWidth="1.4">
          <path d="M137 78C119 48 74 66 72 104C44 147 110 202 170 219C209 199 247 169 244 124C243 89 218 64 189 78C191 49 182 24 163 22L143 24L147 51L157 62L155 84Z" />
          <path d="M169 29L180 10L193 18L184 39M151 24L145 5L132 11L138 37M162 22L161 4L174 3L176 26M190 80L215 51L241 51L243 66L224 67L207 89M136 83L113 47L96 53L114 88" />
          <path
            d="M160 88Q126 126 169 211M170 104Q193 116 220 105M160 125L122 104L93 117M164 150L202 140L227 157"
            fill="none"
          />
        </g>
      </svg>
    );
  return (
    <svg viewBox="0 0 320 240" role="img" aria-label="Schematic kidneys">
      <g fill="#8adbd218" stroke="#8adbd2" strokeWidth="1.4">
        <path d="M89 37C48 29 29 75 35 119C40 165 76 185 104 169C127 155 121 133 105 124C87 114 87 96 102 84C121 69 114 43 89 37ZM231 37C272 29 291 75 285 119C280 165 244 185 216 169C193 155 199 133 215 124C233 114 233 96 218 84C199 69 206 43 231 37Z" />
        <path
          d="M100 108L141 111M220 108L179 111M150 27V168M170 27V168M98 127Q145 143 136 211M222 127Q175 143 184 211"
          fill="none"
        />
      </g>
    </svg>
  );
}
