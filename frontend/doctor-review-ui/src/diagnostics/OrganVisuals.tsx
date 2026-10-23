import { useState } from "react";
import type { Organ } from "./organDefinitions";
import { organInfo } from "./organDefinitions";
import { BrainMap } from "./MedicalVisuals";
import { PancreasArtwork } from "./PancreasTwin";

export function OrganVisual({ organ }: { organ: Organ; [key: string]: any }) {
  const [failed, setFailed] = useState(false);

  if (!failed)
    return (
      <img
        className="ot-organ-artwork ot-floating-organ"
        src={`/diagnostics/${organ === "brain" ? "brain" : `${organ}-atlas`}.png`}
        alt={`Illustrative ${organInfo[organ].name.toLowerCase()} anatomy`}
        onError={() => setFailed(true)}
      />
    );
  if (organ === "pancreas") return <PancreasArtwork />;
  if (organ === "brain") return <BrainMap compact />;
  if (organ === "heart")
    return (
      <svg viewBox="0 0 320 240" role="img" aria-label="Schematic heart anatomy">
        <g fill="#8adbd218" stroke="#8adbd2" strokeWidth="1.4">
          <path d="M137 78C119 48 74 66 72 104C44 147 110 202 170 219C209 199 247 169 244 124C243 89 218 64 189 78C191 49 182 24 163 22L143 24L147 51L157 62L155 84Z" />
        </g>
      </svg>
    );
  return (
    <svg viewBox="0 0 320 240" role="img" aria-label="Schematic kidneys">
      <g fill="#8adbd218" stroke="#8adbd2" strokeWidth="1.4">
        <path d="M89 37C48 29 29 75 35 119C40 165 76 185 104 169C127 155 121 133 105 124C87 114 87 96 102 84C121 69 114 43 89 37ZM231 37C272 29 291 75 285 119C280 165 244 185 216 169C193 155 199 133 215 124C233 114 233 96 218 84C199 69 206 43 231 37Z" />
      </g>
    </svg>
  );
}
