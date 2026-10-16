const {test, before, after} = require("node:test");
const assert = require("node:assert");
const {server} = require("../server");
const snapshot = require("../snapshot.json");

let base;

before(() => new Promise(resolve => server.listen(0, () => {
    base = `http://localhost:${server.address().port}`;
    resolve();
})));

after(() => server.close());

const get = (url) => fetch(base + url);
const run = (program) => fetch(`${base}/programs/v1/run`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(program)
});

test("serves groups, programs and meta-languages from the snapshot", async () => {
    assert.deepStrictEqual(await (await get("/groups")).json(), snapshot.groups);
    assert.deepStrictEqual(await (await get("/groups/1")).json(), snapshot.groupsById["1"]);
    assert.deepStrictEqual(await (await get("/programs/ofGroup/1")).json(), snapshot.programsOfGroup["1"]);
    assert.deepStrictEqual(await (await get("/programs/ofGroup/2")).json(), []);
    assert.deepStrictEqual(await (await get("/programs/meta/v1")).json(), snapshot.metaLanguages.v1);
    assert.strictEqual((await get("/groups/99")).status, 404);
    assert.strictEqual((await get("/programs/meta/v9")).status, 404);
});

test("evaluates the snapshot programs into commands named by device uid", async () => {
    const [first, second] = snapshot.programsOfGroup["1"];

    assert.deepStrictEqual(await (await run(first.data)).json(), [{name: "1.3", params: ["false"]}]);

    // The second program switches the strip off in the morning and evening hours
    // while the tank is above 50 %; otherwise only when socket 1 is off, which it is not.
    const hour = new Date().getHours();
    const daytime = (hour > 5 && hour < 12) || (hour > 13 && hour < 23);

    assert.deepStrictEqual(await (await run(second.data)).json(), daytime ? [{name: "1.3", params: ["false"]}] : []);
});

test("maps non-numeric device uids in conditions and commands", async () => {
    const response = await run({
        block: [{name: "if", condition: "device_uid_1.Power === 50", block: [{name: "device_uid_1.2", params: ["x"]}]}]
    });

    assert.deepStrictEqual(await response.json(), [{name: "device_uid_1.2", params: ["x"]}]);
});

test("rejects names that are not device ids", async () => {
    const response = await run({block: [{name: "if", condition: "PowerStrip.Socket 1 === 1", block: []}]});

    assert.strictEqual(response.status, 400);
    assert.match((await response.json()).message, /Unknown device parameter or capability "PowerStrip.Socket"/);
});

test("rejects malformed programs", async () => {
    assert.strictEqual((await run({nothing: true})).status, 400);
    assert.strictEqual((await fetch(`${base}/programs/v1/run`, {method: "POST", body: "{"})).status, 400);
});

test("allows cross-origin requests", async () => {
    const response = await fetch(`${base}/programs/v1/run`, {method: "OPTIONS"});

    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get("access-control-allow-origin"), "*");
});
