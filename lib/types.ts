export const SERVICE_KEYS = [
  "networkHospital",
  "claimsHistory",
  "ecard",
  "claimIntimation",
  "claimSubmission",
  "activeListEnrollment",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export type Tpa = {
  id: number;
  name: string;
  networkHospital: boolean;
  claimsHistory: boolean;
  ecard: boolean;
  claimIntimation: boolean;
  claimSubmission: boolean;
  activeListEnrollment: boolean;
  createdAt: string;
  updatedAt: string;
};

export const SERVICES: { key: ServiceKey; label: string; shortLabel: string }[] = [
  { key: "networkHospital", label: "Network Hospital", shortLabel: "Network" },
  { key: "claimsHistory", label: "Claims History", shortLabel: "History" },
  { key: "ecard", label: "E-card", shortLabel: "E-card" },
  { key: "claimIntimation", label: "Claim Intimation", shortLabel: "Intimation" },
  { key: "claimSubmission", label: "Claim Submission", shortLabel: "Submission" },
  { key: "activeListEnrollment", label: "Active List / Enrollment", shortLabel: "Enrollment" },
];
