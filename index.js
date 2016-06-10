const uuid = require("node-uuid");

function promiseOrTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      return reject(new TimeoutError());
    }, timeoutMs);
    promise.then((r) => {
      clearTimeout(timeout);
      return resolve(r);
    }, (e) => {
      clearTimeout(timeout);
      return reject(e);
    })
  });
}

function blpopTimeout(redis, listName, timeout) {
  // wait whole seconds for ms timeout seconds where [1, 1000] =-> 1, [1001, 2000] -> 2
  return promiseOrTimeout(redis.blpop(listName, Math.ceil(timeout / 1000)), timeout).then((response) => {
    //unlikely, but it could happen. avoid race conitions...
    if (response == null) {
      throw new TimeoutError();
    }
    return response;
  });
}

class TimeoutError extends Error {
  constructor(call) {
    const message = `Timeout exceeded.`;
    super(message);
    this.message = message;
    this.name = 'TimeoutError';
  }
}

class RedisRPC {
  constructor(redis, prefix = "redis_rpc:", disableGC = false) {
    this._redis = redis;
    this._prefix = prefix;
    this._clientId = uuid.v4(uuid.nodeRNG);
    this._handle = new Set();
  }

  _getTypeQueue(type) {
    return `${this._prefix}${encodeURIComponent(type)}`;
  }

  //It is up to you to implement your own flow limiting and response logic.
  //This method will consume messages as soon as the promise of your worker resolves.
  //It will also try to consume one call AFTER it is told to stop handling a type.
  handleCustom(type, worker) {
    const queue = this._getTypeQueue(type);
    if (this._handle.has(queue)) {
      throw new Error(`Duplicate handler type ${type}`);
    }
    this._handle.add(queue);

    const getMessage = () => {
      if (!this._handle.has(queue)) {
        //console.log(`[redis-rpc] terminated listener for ${queue}`)
        return;
      }

      this._redis.blpop(queue, 0).then((message) => {
        try {
          const call = JSON.parse(message[1]);
          return worker(call, this._clientId, this._redis).then(null, (e) => {
            console.log(`[redis-rpc] swallowed rejection from call handler <${queue}>: ${e}`);
          })
        } catch (e) {
          console.log(`[redis-rpc] swallowed exception from call handler <${queue}>: ${e.message}`);
        }
      }, (e) => {
        console.log(`[redis-rpc] swallowed rejection from call listener <${queue}>: ${e}`);
      }).then(() => process.nextTick(getMessage))
    }
    getMessage();
  }

  //This handler waits for a call to finish before pulling another
  handle(type, worker) {
    this.handleCustom(type, (call, clientId, redis) => {
      return worker(call.arguments).then((result) => {
        if (call.hasOwnProperty("responseQueue")) {
          this._redis.rpush(call.responseQueue, JSON.stringify({clientId, result})).then(null, (e) => {
            console.log(`[redis-rpc] failed to enqueue result to call ${call.responseQueue}: ${e}`);
          });
        }
      });
    });
  }

  //This handler waits for a call to finsh and any response to be sent before pulling another
  handleStrong(type, worker) {
    this.handleCustom(type, (call, clientId, redis) => {
      return worker(call.arguments).then((result) => {
        if (call.hasOwnProperty("responseQueue")) {
          return this._redis.rpush(call.responseQueue, JSON.stringify({clientId, result})).then(null, (e) => {
            console.log(`[redis-rpc][STRONG] failed to enqueue result to call ${call.responseQueue}: ${e}`);
          });
        } else {
          console.log(`[redis-rpc][STRONG] failed to enqueue result for call without responseQueue`);
        }
      });
    });
  }


  //This does not wait for calls to finish before loading more
  //Use of this queue will likely make your app run out of memory, or break in other fun ways
  handleUnlimited(type, worker) {
    this.handleCustom(type, (call, clientId, redis) => {
      worker(call.arguments).then((result) => {
        if (call.hasOwnProperty("responseQueue")) {
          this._redis.rpush(call.responseQueue, JSON.stringify({clientId, result})).then(null, (e) => {
            console.log(`[redis-rpc] failed to enqueue result to call ${call.responseQueue}: ${e}`);
          });
        }
      });
      return new Promise((r)=>r());
    });
  }

  send(type, args, timeout = 3000) {
    const callId = uuid.v4(uuid.nodeRNG);
    const queue = `${this._prefix}${encodeURIComponent(type)}`;
    const call = `${this._clientId}:${callId}`;
    const responseQueue = `${this._prefix}${this._clientId}:${callId}`
    //console.log(`[redis-rpc] started send for ${call} to ${queue}`);
    return new Promise((resolve, reject) => {
      this._redis.rpush(queue, JSON.stringify({type, args, responseQueue, timeout})).then(null, reject);
      blpopTimeout(this._redis, responseQueue, timeout).then(resolve, reject);
    });
  }

  fire(type, args) {
    return this._redis.rpush(queue, JSON.stringify({type, args, clientId: this._clientId}));
  }
}

module.exports = RedisRPC;

module.exports.TimeoutError = TimeoutError;
