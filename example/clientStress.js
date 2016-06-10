const Redis = require("ioredis");
const RedisRPC = require("../index.js");
const _ = require("lodash");

const redis = new Redis();
const rpc = new RedisRPC(redis, "redis_rpc:", true);

const count = 10000;
const range = _.range(count);

const startTime = Date.now();
Promise.all(range.map((number) => rrpc.send("call", number, 10 * count))).then(() => {
  const endTime = Date.now();
  console.log(`test (${count}) messages took ${(endTime - startTime)}ms`);
  process.exit(0);
}, (e) => {
  console.log(`test failed: ${e}`);
  process.exit(-1);
});
