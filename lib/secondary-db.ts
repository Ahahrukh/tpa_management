import { Db, MongoClient } from "mongodb";

type SecondaryMongoCache = {
  uri?: string;
  client?: MongoClient;
  connection?: Promise<MongoClient>;
};

const globalSecondaryMongo = globalThis as typeof globalThis & {
  __tpaSecondaryMongo?: SecondaryMongoCache;
};

const cache = globalSecondaryMongo.__tpaSecondaryMongo ?? (globalSecondaryMongo.__tpaSecondaryMongo = {});

async function getSecondaryClient() {
  const uri = process.env.SECONDARY_MONGODB_URI;
  if (!uri) throw new Error("SECONDARY_MONGODB_URI is not configured.");

  if (cache.uri !== uri) {
    cache.uri = uri;
    cache.client = undefined;
    cache.connection = undefined;
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

export async function getSecondaryDatabase(): Promise<Db> {
  const client = await getSecondaryClient();
  return client.db(process.env.SECONDARY_MONGODB_DB ?? "raha_insurance_prod");
}
