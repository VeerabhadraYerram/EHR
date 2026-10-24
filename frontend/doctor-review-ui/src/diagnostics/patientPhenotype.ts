import type { Patient } from './types';
export type BodySex = 'female' | 'male' | 'neutral';
export function recordedNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '')
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
export function phenotypeFor(patient: Patient, previewReference = false) {
    const value = String(patient.sex || '').trim().toLowerCase();
    const sex: BodySex = ['female', 'f'].includes(value) ? 'female' : ['male', 'm'].includes(value) ? 'male' : 'neutral';
    const rawBmi = recordedNumber(patient.bmi), rawAge = recordedNumber(patient.age_years);
    const bmi = rawBmi !== null && rawBmi > 0 ? rawBmi : null, age = rawAge !== null && rawAge >= 18 && rawAge <= 120 ? rawAge : null;
    const displayBmi = previewReference ? 22 : bmi;
    const ageBlend = age === null ? 0 : Math.max(0, Math.min(1, (age - 30) / 50));
    const lean = displayBmi === null ? 0 : Math.max(0, Math.min(1, (22 - displayBmi) / 5));
    const heavy = displayBmi === null ? 0 : Math.max(0, Math.min(1, (displayBmi - 22) / 18));
    return { sex, bmi, age, displayBmi, ageBlend, morphWeights: [(1 - ageBlend) * lean, (1 - ageBlend) * heavy, ageBlend * (1 - lean - heavy), ageBlend * lean, ageBlend * heavy],
        method: 'MakeHuman CC0 sex/age/weight morph interpolation with bounded authored adiposity envelope; BMI-to-weight mapping is a bounded presentation heuristic, not a body-composition estimator',
        missing: [...(bmi === null ? ['BMI'] : []), ...(age === null ? ['age'] : []), ...(sex === 'neutral' ? ['recorded sex'] : [])],
        measuredOrganMorphology: false as const };
}
