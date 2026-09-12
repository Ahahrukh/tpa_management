export type TpaSeed = { name: string; aliases: string[] };

export const TPA_SEEDS: TpaSeed[] = [
  { name: "FHPL", aliases: ["FHPL", "Family Health Plan Limited"] },
  { name: "Medi Assist", aliases: ["MEDIASSIST", "Medi Assist Insurance TPA Pvt Ltd"] },
  { name: "Safeway", aliases: ["SAFEWAY", "Safeway Insurance TPA Pvt Ltd"] },
  { name: "Health India", aliases: ["Health India Network", "HEALTHINDIA"] },
  { name: "MDIndia", aliases: ["MDINDIA", "MDIndia Health Insurance TPA Pvt. Ltd"] },
  { name: "Ericson", aliases: ["ERICSON", "Ericson Healthcare Pvt. Ltd"] },
  { name: "Go Digit", aliases: ["GODIGIT", "DIGIT", "Go Digit General Insurance Limited"] },
  { name: "ICICI Lombard", aliases: ["ICICI", "ICIC", "ICICI LOMBARD General Insurance Co. Ltd"] },
  { name: "GHPL", aliases: ["GHPL", "Good Health Private Limited"] },
  { name: "Care Health", aliases: ["CARE", "Care Health Insurance"] },
  { name: "Niva Bupa", aliases: ["NIVABUPA", "NIVA Bupa Health Insurance Co. Ltd"] },
  { name: "SBI General", aliases: ["SBI", "SBI General Insurance Co. Ltd"] },
  { name: "Aditya Birla Health", aliases: ["ABHI", "Aditya Birla Health Insurance Co. Ltd"] },
  { name: "Reliance General", aliases: ["RELIANCE", "Reliance General Insurance Co. Ltd"] },
  { name: "Bajaj Allianz", aliases: ["BAJAJ", "Bajaj Allianz General Insurance Co. Ltd"] },
  { name: "Vidal Health", aliases: ["VIDAL", "Vidal Health Insurance Co. Ltd"] },
];

export function normalizeTpaName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalTpaName(value: string) {
  const normalized = normalizeTpaName(value);
  if (normalized.includes("carehealth")) return "Care Health";
  if (normalized.includes("reliancegeneralinsurance")) return "Reliance General";
  const match = TPA_SEEDS.find((tpa) =>
    normalizeTpaName(tpa.name) === normalized || tpa.aliases.some((alias) => normalizeTpaName(alias) === normalized),
  );
  return match?.name;
}
