const Redis = require("ioredis");
const RedisRPC = require("../index.js");

const redis = new Redis();
const rpc = new RedisRPC(redis, "redis_rpc:", true);

rrpc.send("call", null).then((a) => {
  console.log("bueno?");
  console.log(a);
  process.exit(0);
}, (e) => {
  console.log(e);
  console.log((new Error()).stack);
  console.log("malo");
  process.exit(1);
});
