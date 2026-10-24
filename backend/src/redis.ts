import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const redisClient = new Redis(REDIS_URL);
export const resultClient = new Redis(REDIS_URL);
export const workerClient = new Redis(REDIS_URL);
export const subscriber = new Redis(REDIS_URL);
export const publisher = new Redis(REDIS_URL);