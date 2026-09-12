import { MongoClient } from "mongodb";

const tpas = [
  ["FHPL", ["FHPL", "Family Health Plan Limited"]],
  ["Medi Assist", ["MEDIASSIST", "Medi Assist Insurance TPA Pvt Ltd"]],
  ["Safeway", ["SAFEWAY", "Safeway Insurance TPA Pvt Ltd"]],
  ["Health India", ["Health India Network", "HEALTHINDIA"]],
  ["MDIndia", ["MDINDIA", "MDIndia Health Insurance TPA Pvt. Ltd"]],
  ["Ericson", ["ERICSON", "Ericson Healthcare Pvt. Ltd"]],
  ["Go Digit", ["GODIGIT", "Go Digit General Insurance Limited"]],
  ["ICICI Lombard", ["ICICI", "ICICI LOMBARD General Insurance Co. Ltd"]],
  ["GHPL", ["GHPL", "Good Health Private Limited"]],
  ["Care Health", ["Care", "Care Health"]],
  ["Niva Bupa", ["NIVABUPA", "NIVA Bupa Health Insurance Co. Ltd"]],
  ["SBI General", ["SBI", "SBI General Insurance Co. Ltd"]],
  ["Aditya Birla Health", ["ABHI", "Aditya Birla Health Insurance Co. Ltd"]],
  ["Reliance / IndusInd", ["Reliance", "Relaince", "Reliance General Insurance", "Reliance General Insurance Co. Ltd", "IndusInd General Health Insurance", "IndusInd General Insurance", "IndusInd", "Induslnd"]],
];

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const failed = {
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
await collection.updateMany({}, { $set: { "activeEnvironments.prod": false } });
for (const [name, aliases] of tpas) {
  const now = new Date();
  const normalizedName = normalize(name);
  const legacyNames = name === "Reliance / IndusInd" ? ["reliancegeneral"] : [];
  const existing = await collection.findOne({ normalizedName: { $in: [normalizedName, ...legacyNames] } });
  if (existing) {
    await collection.updateOne(
      { _id: existing._id },
      { $set: { name, normalizedName, aliases, normalizedAliases: aliases.map(normalize), "activeEnvironments.prod": true, "environments.prod": failed, updatedAt: now } },
    );
  } else {
    await collection.insertOne({
      name,
      normalizedName,
      aliases,
      normalizedAliases: aliases.map(normalize),
      activeEnvironments: { uat: false, prod: true },
      environments: { uat: { ...failed }, prod: { ...failed } },
      createdAt: now,
      updatedAt: now,
    });
  }
}
console.log(`Synced ${tpas.length} Production TPAs with all services set to not working.`);
await client.close();
