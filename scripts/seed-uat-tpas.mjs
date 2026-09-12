import { MongoClient } from "mongodb";

const tpas = [
  ["FHPL", ["FHPL", "Family Health Plan Limited"]],
  ["Medi Assist", ["MEDIASSIST", "Medi Assist Insurance TPA Pvt Ltd"]],
  ["Safeway", ["SAFEWAY", "Safeway Insurance TPA Pvt Ltd"]],
  ["Health India", ["HEALTHINDIA", "Health India Network"]],
  ["MDIndia", ["MDINDIA", "MDIndia Health Insurance TPA Pvt. Ltd"]],
  ["Ericson", ["ERICSON", "Ericson Healthcare Pvt. Ltd"]],
  ["Go Digit", ["GODIGIT", "DIGIT", "Go Digit General Insurance Limited"]],
  ["ICICI Lombard", ["ICICI", "ICIC", "ICICI LOMBARD General Insurance Co. Ltd"]],
  ["GHPL", ["GHPL", "Good Health Private Limited"]],
  ["Care Health", ["CARE", "Care Health Insurance"]],
  ["Niva Bupa", ["NIVABUPA", "NIVA Bupa Health Insurance Co. Ltd"]],
  ["SBI General", ["SBI", "SBI General Insurance Co. Ltd"]],
  ["Aditya Birla Health", ["ABHI", "Aditya Birla Health Insurance Co. Ltd"]],
  ["Reliance General", ["RELIANCE", "Reliance General Insurance Co. Ltd"]],
  ["Bajaj Allianz", ["BAJAJ", "Bajaj Allianz General Insurance Co. Ltd"]],
  ["Vidal Health", ["VIDAL", "Vidal Health Insurance Co. Ltd"]],
];

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const notWorking = {
  networkHospital: false,
  claimsHistory: false,
  ecard: false,
  claimIntimation: false,
  claimSubmission: false,
  activeListEnrollment: false,
  blacklistedHospitals: false,
  review: "",
};

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const collection = client.db(process.env.MONGODB_DB || "tpa_management").collection("tpas");
await collection.updateMany({}, { $set: { "activeEnvironments.uat": false } });

for (const [name, aliases] of tpas) {
  const normalizedName = normalize(name);
  const normalizedAliases = aliases.map(normalize);
  const legacyNames = name === "Reliance General" ? ["relianceindusind"] : [];
  const existing = await collection.findOne({
    $or: [
      { normalizedName: { $in: [normalizedName, ...legacyNames] } },
      { normalizedAliases: { $in: [normalizedName, ...normalizedAliases] } },
    ],
  });
  const now = new Date();

  if (existing) {
    await collection.updateOne(
      { _id: existing._id },
      { $set: { aliases, normalizedAliases, "activeEnvironments.uat": true, "environments.uat": notWorking, updatedAt: now } },
    );
  } else {
    await collection.insertOne({
      name,
      normalizedName,
      aliases,
      normalizedAliases,
      activeEnvironments: { uat: true, prod: false },
      environments: { uat: { ...notWorking }, prod: { ...notWorking } },
      createdAt: now,
      updatedAt: now,
    });
  }
}

console.log(`Seeded ${tpas.length} UAT TPAs with all services set to not working.`);
await client.close();
