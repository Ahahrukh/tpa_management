export const SERVICE_KEYS = [
  "networkHospital",
  "claimsHistory",
  "ecard",
  "claimIntimation",
  "claimSubmission",
  "activeListEnrollment",
  "blacklistedHospitals",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export type EnvironmentKey = "uat" | "prod";
export type ServiceValue = boolean | null;
export type TpaEnvironment = Record<ServiceKey, ServiceValue> & { review: string };

export type Tpa = {
  id: string;
  name: string;
  aliases: string[];
  environments: Record<EnvironmentKey, TpaEnvironment>;
  createdAt: string;
  updatedAt: string;
};

export type ServiceFailure = {
  id: string;
  tpaId: string;
  tpaName: string;
  serviceName: ServiceKey;
  environment: EnvironmentKey;
  reason: string;
  failedAt: string;
  reportedAt: string;
};

export type UserPermissions = {
  add: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
};

export type AuthUser = {
  id: string;
  username: string;
  role: "admin" | "viewer";
  permissions: UserPermissions;
};

export const SERVICES: { key: ServiceKey; label: string; shortLabel: string }[] = [
  { key: "networkHospital", label: "Network Hospital", shortLabel: "Network" },
  { key: "claimsHistory", label: "Claims History", shortLabel: "History" },
  { key: "ecard", label: "E-card", shortLabel: "E-card" },
  { key: "claimIntimation", label: "Claim Intimation", shortLabel: "Intimation" },
  { key: "claimSubmission", label: "Claim Submission", shortLabel: "Submission" },
  { key: "activeListEnrollment", label: "Active List / Enrollment", shortLabel: "Enrollment" },
  { key: "blacklistedHospitals", label: "Blacklisted Hospitals", shortLabel: "Blacklist" },
];
