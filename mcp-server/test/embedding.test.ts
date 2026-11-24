import test from "node:test";
import assert from "node:assert/strict";
import { getEmbedding, getDeterministicMockEmbedding, EMBEDDING_DIMENSIONS } from "../src/services/embedding.js";

const mockGemini = (values: number[]) =>
  (async () => new Response(JSON.stringify({ embedding: { values } }), { status: 200 })) as typeof fetch;

test("getEmbedding - requests index dimensionality from Gemini and accepts a matching vector", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  let sentBody: any;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ embedding: { values: new Array(EMBEDDING_DIMENSIONS).fill(0.1) } }), { status: 200 });
  });
  const emb = await getEmbedding("charger");
  assert.equal(sentBody.outputDimensionality, EMBEDDING_DIMENSIONS);
  assert.equal(emb.length, EMBEDDING_DIMENSIONS);
  assert.equal(emb[0], 0.1);
  delete process.env.GEMINI_API_KEY;
});

test("getEmbedding - falls back when Gemini returns the wrong dimensionality", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", mockGemini(new Array(768).fill(0.1)));
  const emb = await getEmbedding("charger");
  assert.deepEqual(emb, getDeterministicMockEmbedding("charger"));
  assert.equal(emb.length, EMBEDDING_DIMENSIONS);
  delete process.env.GEMINI_API_KEY;
});
