export type Organ = "pancreas" | "kidneys" | "heart" | "brain";
export type TwinView = "body" | Organ;
export const twinViews: TwinView[] = [
  "body",
  "pancreas",
  "kidneys",
  "heart",
  "brain",
];
export const organInfo = {
  pancreas: {
    name: "Pancreas",
    system: "Metabolic",
    color: "#8adbd2",
    scan: "Pancreatic MRI / CT",
    structures: ["Head", "Body", "Tail"],
    landmarks: [
      [27, 52],
      [49, 47],
      [72, 42],
    ],
  },
  kidneys: {
    name: "Kidneys",
    system: "Renal",
    color: "#8adbd2",
    scan: "Renal ultrasound / CT",
    structures: ["Right kidney", "Left kidney", "Renal hilum"],
    landmarks: [
      [25, 54],
      [75, 43],
      [40, 46],
    ],
  },
  heart: {
    name: "Heart",
    system: "Cardiovascular",
    color: "#8adbd2",
    scan: "Echocardiogram / cardiac MRI",
    structures: ["Aorta", "Ventricular surface", "Apex"],
    landmarks: [
      [52, 25],
      [50, 55],
      [76, 88],
    ],
  },
  brain: {
    name: "Brain",
    system: "Neurological",
    color: "#8adbd2",
    scan: "Brain MRI / CT",
    structures: ["Cerebral cortex", "Cerebellum", "Brainstem"],
    landmarks: [
      [46, 38],
      [67, 64],
      [67, 76],
    ],
  },
} as const;
