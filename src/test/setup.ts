process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-at-least-32-characters-long";
process.env.NODE_ENV ??= "test";
