import { test } from "node:test";
import assert from "node:assert/strict";
import {
  organMetrics,
  matchingOrganForecast,
} from "../src/diagnostics/organEvidence.ts";
import type {
  Patient,
  Reading,
  PatientSimulation,
} from "../src/diagnostics/types.ts";

const patient = {
  person_id: "P1",
  egfr: 92,
  creatinine_mg_dl: 0.9,
  hba1c_percent: 7.2,
} as Patient;
const reading = {
  person_id: "P1",
  reading_time: "2021-01-01T10:00:00",
  glucose_mg_dl: 123,
} as Reading;
const simulation = {
  person_id: "P1",
  decision_time: reading.reading_time,
  baseline: { person_id: "P1", decision_time: reading.reading_time, predicted_peak_glucose_mg_dl: 150 },
} as PatientSimulation;
test("organ cards use appropriate recorded fields and preserve missing values", () => {
  assert.deepEqual(
    organMetrics("kidneys", patient, reading).map((x) => x.value),
    [92, 0.9],
  );
  assert.equal(organMetrics("pancreas", patient, reading)[0].value, 123);
  assert.equal(organMetrics("pancreas", patient, reading)[2].value, null);
  assert.deepEqual(organMetrics("lungs", patient, reading), []);
});
test("forecasts cannot leak across patient or recording selection", () => {
  assert.equal(
    matchingOrganForecast(patient, reading, simulation),
    simulation.baseline,
  );
  assert.equal(
    matchingOrganForecast({ ...patient, person_id: "P2" }, reading, simulation),
    null,
  );
  assert.equal(
    matchingOrganForecast(
      patient,
      { ...reading, reading_time: "2021-01-01T10:05:00" },
      simulation,
    ),
    null,
  );
  assert.equal(
    matchingOrganForecast(patient, { ...reading, person_id: "P2" }, simulation),
    null,
  );
  assert.equal(
    matchingOrganForecast(patient, reading, {
      ...simulation,
      baseline: { ...simulation.baseline, person_id: "P2" },
    }),
    null,
  );
  assert.equal(matchingOrganForecast(patient, null, simulation), null);
});
