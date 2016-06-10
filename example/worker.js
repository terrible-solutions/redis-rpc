const Redis = require("ioredis");
const RedisRPC = require("../index.js");
const redis = new Redis();

const rpc = new RedisRPC(redis, "redis_rpc:", true);

rrpc.handle("call", (args) => {
  return new Promise((resolve) => {
    resolve("call's done");
  });
});
