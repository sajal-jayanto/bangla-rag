import "dotenv/config";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  db: {
    url: required("DATABASE_URL"),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
    chatModel: process.env.GEMINI_CHAT_MODEL ?? "gemini-3.5-flash",
  },
  search: {
    minSimilarity: Number(process.env.SEARCH_MIN_SIMILARITY ?? 0.6),
  },
  jwt: {
    secret: required("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  },
} as const;

if (!(env.search.minSimilarity >= 0 && env.search.minSimilarity <= 1)) {
  throw new Error("SEARCH_MIN_SIMILARITY must be a number between 0 and 1");
}

if (env.jwt.secret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}
