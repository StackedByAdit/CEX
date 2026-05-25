import Redis from "ioredis";

export const redisClient = new Redis();
export const resultClient = new Redis();
export const workerClient = new Redis();
export const subscriber = new Redis();
export const publisher = new Redis();