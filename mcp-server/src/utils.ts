import crypto from "crypto";

/**
 * Computes an MD5 string hash for file content/cache keys.
 */
export function getHash(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * Recursively converts Neo4j-specific types (Integer, DateTime, Date, etc.)
 * into standard JS primitives or ISO strings so they serialize cleanly in JSON.
 */
export function convertNeo4jTypes(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (typeof value === "object") {
    // 1. Neo4j Integer (has .low and .high properties, or constructor name is "Integer")
    if (value.constructor && value.constructor.name === "Integer") {
      return value.toNumber();
    }
    if (typeof value.low === "number" && typeof value.high === "number" && Object.keys(value).length === 2) {
      return value.high === 0 ? value.low : (value.high * 4294967296 + (value.low >>> 0));
    }
    
    // 2. Neo4j Temporal Types (Date, DateTime, Time, LocalTime, Duration)
    if (value.constructor && ["Date", "DateTime", "Time", "LocalTime", "Duration"].includes(value.constructor.name)) {
      return value.toString();
    }
    
    // 3. Arrays
    if (Array.isArray(value)) {
      return value.map(convertNeo4jTypes);
    }
    
    // 4. Objects (dicts)
    const converted: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      converted[key] = convertNeo4jTypes(value[key]);
    }
    return converted;
  }
  
  return value;
}

/**
 * Checks if a Cypher query contains database-mutating operations.
 */
export function isForbiddenCypherQuery(query: string): boolean {
  if (!query || typeof query !== "string") return false;
  const mutatingKeywords = ["CREATE", "MERGE", "DELETE", "SET", "REMOVE", "DROP", "DETACH"];
  const upperQuery = query.toUpperCase();
  return mutatingKeywords.some(keyword => new RegExp(`\\b${keyword}\\b`).test(upperQuery));
}
