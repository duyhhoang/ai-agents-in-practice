import test from "node:test";
import assert from "node:assert/strict";
import { getHash, convertNeo4jTypes, isForbiddenCypherQuery } from "../src/utils.js";

test("getHash - returns deterministic MD5 hex string", () => {
  const text = "TUM Supply Chain Test String";
  const hash1 = getHash(text);
  const hash2 = getHash(text);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 32); // MD5 hex length
  assert.notEqual(hash1, getHash("Different text"));
});

test("convertNeo4jTypes - converts primitive values and objects", () => {
  const input = {
    name: "ChargingStation A",
    count: { low: 42, high: 0 },
    items: [
      { low: 10, high: 0 },
      "string_val"
    ],
    nullVal: null
  };
  const result = convertNeo4jTypes(input);
  assert.deepEqual(result, {
    name: "ChargingStation A",
    count: 42,
    items: [10, "string_val"],
    nullVal: null
  });
});

test("isForbiddenCypherQuery - detects mutating keywords", () => {
  assert.equal(isForbiddenCypherQuery("MATCH (n:Actor) RETURN n"), false);
  assert.equal(isForbiddenCypherQuery("MATCH (p:Process {id: 'P01'}) RETURN p.cost_eur"), false);
  assert.equal(isForbiddenCypherQuery("MATCH (n:ChargingStation) WHERE n.unit_id =~ $searchTerm RETURN n"), false);
  
  assert.equal(isForbiddenCypherQuery("CREATE (a:Actor {name: 'Test'})"), true);
  assert.equal(isForbiddenCypherQuery("MATCH (n) DETACH DELETE n"), true);
  assert.equal(isForbiddenCypherQuery("MATCH (a:Actor) SET a.country = 'DE'"), true);
  assert.equal(isForbiddenCypherQuery("MERGE (c:ChargingStation {id: '1'})"), true);
  assert.equal(isForbiddenCypherQuery("MATCH (n) REMOVE n.flag"), true);
  assert.equal(isForbiddenCypherQuery("DROP INDEX actor_index IF EXISTS"), true);
});

test("parameterized query regex helper", () => {
  const term = "Steel (Alpha) & Co.";
  const sanitized = term.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&").replace(/'/g, "\\'");
  const regex = `(?i).*${sanitized}.*`;
  assert.equal(regex, "(?i).*Steel \\(Alpha\\) & Co\\..*");
});
