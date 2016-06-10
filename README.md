WARNING
=======

This project is still in an early stage. The API is subject to change, and it may not work for you or your use cases.

This project uses es6 syntax extensively. You will need a semi-recent version of node to run it.

There are no automated tests for this package yet, no guarantees about the qualty (or lack thereof) are made by the author.


Redis-RPC
=========

Have you ever wanted a message queue without any of the guarantees of safety? Have you ever wanted to ignore errors because they happened on some other machine, and you can't do anything about it anyways? I have, and now everyone can.

RedisRPC is a simple way to pass the burden of work to some other poor sap, all you need is a redis server to act as a middleman.


Usage
=====


Common (Setup)
--------------

```js
const Redis = require("ioredis");
const RedisRPC = require("redis-rpc");

//These are arguments to the new RedisRPC
const redis = new Redis("redis://localhost:6379");  //This must be a redis client that is ready to use. So far only ioredis has been tested.
const namespace = "my_app:redis_rpc:";              //This is optional, it defaults to "redis_rpc:""
const disableGarbageCollection = false;             //This is optional, it defaults to false

const rpc = new RedisRPC(redis, namespace, false);
//new RedisRPC(redis); would work in a very simple case.
```


Client (Making RPCs)
--------------------

```js
const callName = "call";
const args = {foo: "bar"};
const timeout = 10000;      //Default is 1000 (ms). This is primarily client-side but may also be used in an advisory way on servers.
                            //If a server processes a call after the timeout has been exceeded the response will be discarded by the client.

rpc.send(callName, args, timeout).then(() => {
  //The return will be a promise, it will be resolved with the answer to your call
})
```


Server (Handling RPCs)
----------------------

```js
rpc.handle("call", (args) => {
  //Your worker should return a promise that resolves to the answer of the call
  //Rejections will be swallowed, which means that if you want error handling on the client, you will need to roll your own protocol
  return new Promise((resolve) => {
    resolve("call's done");
  });
});
```


Custom Handler Types
====================

The built-in `RedisRPC#handle` is an implementation of a custom handler, you can create your own with `RedisRPC#handleCustom`. See the API Documentation for details


API Documentation
=================


### RedisRPC#constructor

Arguments:
* **redis** (*required*) an ioredis (or compatible) client. it should be ready to be used, and should **NOT** use any sort of key prefixing.
* **prefix** (*optional*, default `"redis_rpc:"`) a string to be prepended to all keys stored in redis
* **disableGC** (*optional*, default `false`) whether the garbage collector should not run by this host. It is fairly lightweight and should be run on at least one host to ensure the redis database does not bloat.


### RedisRPC#handleCustom

This method allows you to implement a custom handler mechanism on top of the basic RedisRPC consumer logic.

#### Arguments
* **type** (*required*) astring indicating the type of calls to be handled.
* **worker** (*required*) a function as described below

`worker` will be invoked for each incoming message with the following arguments:
* **call** An object containing information about the call to be processed.
* **clientId** A string identifying the server/connection (a UUIDv4).
* **redis** The redis connection that we are using, that a response can be sent to.

`call` will contain
* **arguments** (*always*) the `args` argument passed to `RedisRPC#send` or `RedisRPC#fire`.
* **type** (*always*) the type of call that is being handled (should match the `type` passed to `handleCustom`)
* **clientId** (*always*) the clientId of the sending server/connection (a UUIDv4).
* **responseQueue** (*sometimes*) the queue a client is listening to for a response. If it is undefined, then thse client does not expect a response and none should be send (`RedisRPC#fire` vs `RedisRPC#send`).

`worker` should return a promise. Upon completion (either rejection or resolution) of the promise RedisRPC will attempt to read another call, this is a back-pressure mechanism. If you intend to implement a sized queue of some sort, then simply do not resolve the promise until your queue has space for more work.

`worker` is responsible for sending a response (if necessary) via `redis` to the `responseQueue`


### RedisRPC#handle

This method is a simple `RedisRPC#handleCustom` implementation that waits until you respond to the current message before fetching another one.

#### Arguments
* **type** (*required*) astring indicating the type of calls to be handled.
* **worker** (*required*) a function as described below

`worker` will be invoked for each incoming message with the following arguments:
* **arguments** The `args` passed to `RedisRPC#send` or `RedisRPC#fire`

`worker` should return a promise. Upon completion (either rejection or resolution) of the promise RedisRPC will attempt to read another call, and send your response (if the promise was resolved, and it is necessary), but will not wait for the redis server to get the response.


### RedisRPC#handleStrong

This method is exactly the same as `RedisRPC#handle`, except it will wait for your responses to be pushed to redis before fetching another call.


### RedisRPC#handleUnlimited

This method is exactly the same as `RedisRPC#handle`, except it will not wait before fetching another call.

#### Warnings

This method is **GREEDY** and will consume all the calls in redis if possible, please keep in mind that it may consume all of your RAM, melt your processor, and/or eat your children. Use with caution, if possible only if you know your call volume will be low.


Is it fast?
===========
Mostly. For my use case it is plenty fast, and able to handle ~400 messages/second on a VM on my laptop. It is fast enough to be limited by only by the difficulty of the calls you are running against it, how fast redis is, and how fast your network is.


Is it safe?
===========
No, don't use this for financial transactions, or other things you care about. Messages can be lost if consumers exit unexpectedly, and sent messages are only as safe as you are willing to make redis (safer = slower writes).
