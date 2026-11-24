import test from "node:test";
import assert from "node:assert/strict";
import { getHash, convertNeo4jTypes, isForbiddenCypherQuery } from "../src/utils.js";
import { chunkText } from "../src/services/chunker.js";
import { createRateLimiter } from "../src/services/rate-limiter.js";

test("getHash - returns deterministic 32-bit hashCode hex string", () => {
  const text = "TUM Supply Chain Test String";
  const hash1 = getHash(text);
  const hash2 = getHash(text);
  assert.equal(hash1, hash2);
  assert.ok(hash1.length <= 8); // 32-bit hashCode hex length
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
  assert.equal(isForbiddenCypherQuery("MATCH (n) SET n.name = 'test'"), true);
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

test("chunkText - breaks text into logical paragraph chunks", () => {
  const sampleDocument = `Paragraph 1: Supply chain risks in European manufacturing. High probability of delay in Q3.

Paragraph 2: Logistics analysis for shipping routes. Sea freight costs increased by 15% due to weather disruptions.

Paragraph 3: Sustainability metrics and ESG compliance. Recycling rate achieved 88% across German assembly plants.`;

  const chunks = chunkText(sampleDocument, 120, 20);
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].index, 0);
  assert.ok(chunks[0].text.includes("Supply chain risks"));
  assert.equal(chunks[1].index, 1);
  assert.ok(chunks[1].text.includes("Logistics analysis"));
});

test("chunkText - edge cases (empty text, single short paragraph, oversized paragraph)", () => {
  // Empty/whitespace text
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   "), []);

  // Single short paragraph (fits within maxChunkSize)
  const shortText = "Just a short single paragraph.";
  const shortChunks = chunkText(shortText, 100, 20);
  assert.equal(shortChunks.length, 1);
  assert.equal(shortChunks[0].index, 0);
  assert.equal(shortChunks[0].text, shortText);

  // Oversized paragraph (longer than maxChunkSize) split by sentence
  const longParagraph = "This is sentence one which is fairly long. This is sentence two which is also long. This is sentence three which is also long.";
  const oversizedChunks = chunkText(longParagraph, 50, 10);
  assert.ok(oversizedChunks.length > 1);
  assert.equal(oversizedChunks[0].index, 0);
  assert.ok(oversizedChunks[0].text.includes("sentence one"));
});

test("createRateLimiter - enforces request limits per IP window", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, message: "Limit reached" });
  let statusCode = 200;

  const mockReq = { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any;
  const mockRes = {
    status(code: number) { statusCode = code; return this; },
    json(body: any) { return body; }
  } as any;

  let passedCount = 0;
  const next = () => { passedCount++; };

  limiter(mockReq, mockRes, next); // Req 1: OK
  limiter(mockReq, mockRes, next); // Req 2: OK
  assert.equal(passedCount, 2);

  limiter(mockReq, mockRes, next); // Req 3: Rate limited!
  assert.equal(passedCount, 2);
  assert.equal(statusCode, 429);
});
