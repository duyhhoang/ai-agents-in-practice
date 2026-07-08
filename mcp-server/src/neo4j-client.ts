import neo4j, { Driver } from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
const user = process.env.NEO4J_USER || "neo4j";
const password = process.env.NEO4J_PASSWORD || "neo4jPASSWORD";

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return driver;
}

export async function closeNeo4jDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export const DEFAULT_SCHEMA = `The database schema contains these nodes:
- ChargingStation {unit_id, serial_number, product_variant, manufacture_date, country, installation_site_id}
- Process {unit_id, process_id, process_name, lifecycle_phase, start_date, end_date, duration_days, status, cost_eur}
- Actor {actor_id, actor_name, region, country}
- Location {location_code, location_name, country}
- Transport {transport_id, unit_id, route_from, route_to, mode, distance_km, cost_eur}

Relationships:
- (:ChargingStation)-[:UNDERGOES]->(:Process)
- (:Process)-[:EXECUTED_BY]->(:Actor)
- (:ChargingStation)-[:LOCATED_IN]->(:Location)
- (:Transport)-[:FOR_UNIT]->(:ChargingStation)`;

export async function getDatabaseSchema(driver: Driver): Promise<string> {
  const session = driver.session();
  try {
    const nodeRes = await session.executeRead(tx => tx.run(`
      MATCH (n)
      WHERE NOT n:ProcessedFile AND NOT n:ProcessedChunk
      WITH labels(n)[0] AS label, keys(n) AS properties
      WHERE label IS NOT NULL
      UNWIND properties AS property
      RETURN label, collect(distinct property) AS propertyKeys
    `));

    const relRes = await session.executeRead(tx => tx.run(`
      MATCH (a)-[r]->(b)
      WHERE NOT a:ProcessedFile AND NOT a:ProcessedChunk AND NOT b:ProcessedFile AND NOT b:ProcessedChunk
      RETURN DISTINCT labels(a)[0] AS fromLabel, type(r) AS relType, labels(b)[0] AS toLabel
    `));

    if (nodeRes.records.length === 0) {
      return DEFAULT_SCHEMA;
    }

    let schemaStr = "The database schema contains these nodes:\n";
    nodeRes.records.forEach(r => {
      const label = r.get("label");
      const props = r.get("propertyKeys");
      schemaStr += `- ${label} {${props.join(", ")}}\n`;
    });

    if (relRes.records.length > 0) {
      schemaStr += "\nRelationships:\n";
      relRes.records.forEach(r => {
        const fromLabel = r.get("fromLabel") || "Any";
        const relType = r.get("relType");
        const toLabel = r.get("toLabel") || "Any";
        schemaStr += `- (:${fromLabel})-[:${relType}]->(:${toLabel})\n`;
      });
    }

    return schemaStr.trim();
  } catch (err) {
    console.warn("Failed to retrieve dynamic database schema, using default fallback:", err);
    return DEFAULT_SCHEMA;
  } finally {
    await session.close();
  }
}
