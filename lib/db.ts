import { Db, MongoClient, ObjectId, type Collection } from "mongodb";
import type { EnvironmentKey, ServiceFailure, ServiceKey, ServiceValue, Tpa, TpaEnvironment, UserPermissions } from "./types";

export type TpaDocument = {
  _id?: ObjectId;
  name: string;
  normalizedName: string;
  aliases?: string[];
  normalizedAliases?: string[];
  activeEnvironments?: Partial<Record<EnvironmentKey, boolean>>;
  environments?: Partial<Record<EnvironmentKey, Partial<TpaEnvironment>>>;
  networkHospital?: boolean;
  claimsHistory?: boolean;
  ecard?: boolean;
  claimIntimation?: boolean;
  claimSubmission?: boolean;
  activeListEnrollment?: boolean;
  blacklistedHospitals?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ServiceEventDocument = {
  _id?: ObjectId;
  tpaId: ObjectId;
  tpaName: string;
  serviceName: ServiceKey;
  status: "pass" | "fail";
  environment: EnvironmentKey;
  reason?: string;
  occurredAt: Date;
  reportedAt: Date;
};

export type UserDocument = {
  _id?: ObjectId;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  role: "admin" | "viewer";
  permissions: UserPermissions;
  createdAt: Date;
  updatedAt: Date;
};

type MongoCache = { uri?: string; client?: MongoClient; connection?: Promise<MongoClient>; initialized?: Promise<void> };
const globalMongo = globalThis as typeof globalThis & { __tpaMongo?: MongoCache };
const cache = globalMongo.__tpaMongo ?? (globalMongo.__tpaMongo = {});

async function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");
  if (cache.uri !== uri) {
    cache.uri = uri;
    cache.client = undefined;
    cache.connection = undefined;
    cache.initialized = undefined;
  }
  if (cache.client) return cache.client;
  cache.connection ??= new MongoClient(uri, { maxPoolSize: 10 }).connect();
  try {
    cache.client = await cache.connection;
    return cache.client;
  } catch (error) {
    cache.connection = undefined;
    throw error;
  }
}

export async function getDatabase(): Promise<Db> {
  const database = (await getClient()).db(process.env.MONGODB_DB ?? "tpa_management");
  cache.initialized ??= Promise.all([
    database.collection<TpaDocument>("tpas").createIndex({ normalizedName: 1 }, { unique: true }),
    database.collection<TpaDocument>("tpas").createIndex({ normalizedAliases: 1 }),
    database.collection<ServiceEventDocument>("serviceEvents").createIndex({ tpaId: 1, occurredAt: -1 }),
    database.collection<ServiceEventDocument>("serviceEvents").createIndex({ occurredAt: -1 }),
    database.collection<UserDocument>("users").createIndex({ normalizedUsername: 1 }, { unique: true }),
  ]).then(() => undefined);
  await cache.initialized;
  return database;
}

export async function getTpaCollection(): Promise<Collection<TpaDocument>> {
  return (await getDatabase()).collection<TpaDocument>("tpas");
}

export async function getServiceEventCollection(): Promise<Collection<ServiceEventDocument>> {
  return (await getDatabase()).collection<ServiceEventDocument>("serviceEvents");
}

export async function getUserCollection(): Promise<Collection<UserDocument>> {
  return (await getDatabase()).collection<UserDocument>("users");
}

export function toTpa(document: TpaDocument & { _id: ObjectId }): Tpa {
  const legacyValue = (key: ServiceKey): ServiceValue => {
    const value = document[key];
    return key === "blacklistedHospitals" && value === undefined ? null : Boolean(value);
  };
  const environment = (key: EnvironmentKey): TpaEnvironment => ({
    networkHospital: document.environments?.[key]?.networkHospital ?? legacyValue("networkHospital"),
    claimsHistory: document.environments?.[key]?.claimsHistory ?? legacyValue("claimsHistory"),
    ecard: document.environments?.[key]?.ecard ?? legacyValue("ecard"),
    claimIntimation: document.environments?.[key]?.claimIntimation ?? legacyValue("claimIntimation"),
    claimSubmission: document.environments?.[key]?.claimSubmission ?? legacyValue("claimSubmission"),
    activeListEnrollment: document.environments?.[key]?.activeListEnrollment ?? legacyValue("activeListEnrollment"),
    blacklistedHospitals: document.environments?.[key]?.blacklistedHospitals ?? legacyValue("blacklistedHospitals"),
    review: document.environments?.[key]?.review ?? "",
  });
  return {
    id: document._id.toHexString(),
    name: document.name,
    aliases: document.aliases ?? [],
    activeEnvironments: {
      uat: document.activeEnvironments?.uat ?? true,
      prod: document.activeEnvironments?.prod ?? true,
    },
    environments: { uat: environment("uat"), prod: environment("prod") },
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function toServiceFailure(document: ServiceEventDocument & { _id: ObjectId }): ServiceFailure {
  return {
    id: document._id.toHexString(),
    tpaId: document.tpaId.toHexString(),
    tpaName: document.tpaName,
    serviceName: document.serviceName,
    environment: document.environment,
    reason: document.reason ?? "No reason provided",
    failedAt: document.occurredAt.toISOString(),
    reportedAt: document.reportedAt.toISOString(),
  };
}
