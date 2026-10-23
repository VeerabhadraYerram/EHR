import type { Organ } from "./organDefinitions";
import type { Patient, Reading } from "./types";
import type { KineticTelemetry } from "./kineticEngine";
import PancreasTwinDeepDive from "./PancreasTwinDeepDive";
import KidneysTwinDeepDive from "./KidneysTwinDeepDive";
import HeartTwinDeepDive from "./HeartTwinDeepDive";
import BrainTwinDeepDive from "./BrainTwinDeepDive";

interface OrganVisualProps {
  organ: Organ;
  patient?: Patient;
  reading?: Reading;
  telemetry: KineticTelemetry;
}

export function OrganVisual({ organ, patient, reading, telemetry }: OrganVisualProps) {
  if (organ === "pancreas") {
    return <PancreasTwinDeepDive patient={patient} reading={reading} telemetry={telemetry} />;
  }
  if (organ === "kidneys") {
    return <KidneysTwinDeepDive patient={patient} reading={reading} telemetry={telemetry} />;
  }
  if (organ === "heart") {
    return <HeartTwinDeepDive patient={patient} reading={reading} telemetry={telemetry} />;
  }
  if (organ === "brain") {
    return <BrainTwinDeepDive patient={patient} reading={reading} telemetry={telemetry} />;
  }
  return null;
}
