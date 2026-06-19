# Implementation & Setup Guide

This guide provides the **corrected and verified** steps to initialize your Neo4j schema and configure your n8n workflows for data ingestion.

**Time Required:** 4-6 hours  
**Status:** Ready to Execute  

---

## ✅ Pre-Flight Checklist

- [ ] Docker Desktop is running.
- [ ] Neo4j container is running: `docker ps | grep neo4j`
- [ ] You can access http://localhost:7474 (Neo4j browser).
- [ ] You can access http://localhost:5678 (n8n).
- [ ] CSV files exist in the `data-processors/` folder.

---

## 🔧 PHASE 1: Neo4j Schema Setup

1. Open http://localhost:7474 and login with `neo4j` / `neo4jPASSWORD`.
2. Execute the following schema queries ONE at a time.

### Query 1: Constraints
```cypher
CREATE CONSTRAINT charging_station_id IF NOT EXISTS 
FOR (cs:ChargingStation) REQUIRE cs.unit_id IS UNIQUE;

CREATE CONSTRAINT process_compound_key IF NOT EXISTS 
FOR (p:Process) REQUIRE (p.unit_id, p.process_id) IS UNIQUE;

CREATE CONSTRAINT actor_id IF NOT EXISTS 
FOR (a:Actor) REQUIRE a.actor_id IS UNIQUE;

CREATE CONSTRAINT location_id IF NOT EXISTS 
FOR (l:Location) REQUIRE l.location_code IS UNIQUE;

CREATE CONSTRAINT transport_id IF NOT EXISTS 
FOR (t:Transport) REQUIRE t.transport_id IS UNIQUE;
```
*(Expected: 5 constraints added)*

### Query 2: Indexes
```cypher
CREATE INDEX charging_station_country IF NOT EXISTS FOR (cs:ChargingStation) ON (cs.country);
CREATE INDEX process_phase IF NOT EXISTS FOR (p:Process) ON (p.lifecycle_phase);
CREATE INDEX actor_country IF NOT EXISTS FOR (a:Actor) ON (a.country);
CREATE INDEX process_status IF NOT EXISTS FOR (p:Process) ON (p.status);
CREATE INDEX process_completion_date IF NOT EXISTS FOR (p:Process) ON (p.completion_date);
```
*(Expected: 5 indexes added)*

---

## 🔐 PHASE 2: n8n Configuration

1. Open http://localhost:5678.
2. Go to **Credentials** → **+ New** → **Neo4j**.
3. Fill in the connection details:
   - **Name:** `Neo4j-SupplyChain`
   - **Host:** `localhost`
   - **Port:** `7687`
   - **Username:** `neo4j`
   - **Password:** `neo4jPASSWORD`
   - **Encryption:** OFF
4. Click **Test connection** and save.

---

## 📊 PHASE 3: Import Workflows

**⚠️ CRITICAL ARCHITECTURE NOTE:** In the current version of n8n, you MUST use a **Loop Over Items** node after loading the CSV, so that the Neo4j node processes each record individually rather than trying to pass the entire array at once.

The proper structure is:
`Manual Trigger → Function (Load CSV) → Loop Over Items → Neo4j Query → Collect Results`

### Workflow 01: Import Actors

**Function Node Code (`Load_Actors_CSV`):**
```javascript
const fs = require('fs');
const csv = require('csv-parse/sync');

const filePath = 'C:/Users/hoang/OneDrive - TUM/Uni/26 SS/AI Agents in Practice/data-processors/03_actors_reference.csv';
const content = fs.readFileSync(filePath, 'utf-8');

const records = csv.parse(content, {
  columns: true,
  skip_empty_lines: true
});

return records.map(record => ({
  json: {
    actor_id: record.actor_id?.trim() || '',
    actor_name: record.actor_name?.trim() || '',
    region: record.region?.trim() || ''
  }
}));
```

**Neo4j Query (inside Loop Over Items):**
```cypher
MERGE (a:Actor {actor_id: $actor_id})
ON CREATE SET 
  a.actor_name = $actor_name,
  a.region = $region,
  a.created_at = datetime()
ON MATCH SET
  a.actor_name = $actor_name,
  a.region = $region
RETURN a.actor_id, a.actor_name
```

---

### Workflow 02: Import Locations

**Function Node Code (`Load_Locations_CSV`):**
```javascript
const fs = require('fs');
const csv = require('csv-parse/sync');

const filePath = 'C:/Users/hoang/OneDrive - TUM/Uni/26 SS/AI Agents in Practice/data-processors/01_charging_stations.csv';
const content = fs.readFileSync(filePath, 'utf-8');

const records = csv.parse(content, {
  columns: true,
  skip_empty_lines: true
});

const countries = [...new Set(records.map(r => r.country))];

return countries.map(country => ({
  json: {
    location_code: `LOC_${country}`,
    location_name: country,
    country: country
  }
}));
```

**Neo4j Query (inside Loop Over Items):**
```cypher
MERGE (l:Location {location_code: $location_code})
ON CREATE SET 
  l.location_name = $location_name,
  l.country = $country,
  l.created_at = datetime()
ON MATCH SET
  l.location_name = $location_name
RETURN l.location_code, l.location_name
```

---

### Workflow 03: Import Charging Stations

**Function Node Code:**
```javascript
const fs = require('fs');
const csv = require('csv-parse/sync');

const filePath = 'C:/Users/hoang/OneDrive - TUM/Uni/26 SS/AI Agents in Practice/data-processors/01_charging_stations.csv';
const content = fs.readFileSync(filePath, 'utf-8');

const records = csv.parse(content, {
  columns: true,
  skip_empty_lines: true
});

return records.map(record => ({
  json: {
    unit_id: record.unit_id?.trim() || '',
    serial_number: record.serial_number?.trim() || '',
    product_variant: record.product_variant?.trim() || '',
    manufacture_date: record.manufacture_date?.trim() || '',
    country: record.country?.trim() || '',
    installation_site_id: record.installation_site_id?.trim() || ''
  }
}));
```

**Neo4j Query 1 (Create Station):**
```cypher
MERGE (cs:ChargingStation {unit_id: $unit_id})
ON CREATE SET 
  cs.serial_number = $serial_number,
  cs.product_variant = $product_variant,
  cs.manufacture_date = date($manufacture_date),
  cs.country = $country,
  cs.installation_site_id = $installation_site_id,
  cs.created_at = datetime()
ON MATCH SET
  cs.serial_number = $serial_number,
  cs.product_variant = $product_variant
RETURN cs.unit_id, cs.product_variant
```

**Neo4j Query 2 (Link to Location):**
```cypher
MATCH (cs:ChargingStation {unit_id: $unit_id})
MATCH (l:Location {country: $country})
MERGE (cs)-[:LOCATED_IN]->(l)
RETURN cs.unit_id, l.location_code
```

---

### Workflow 04: Import Processes

**Function Node Code:**
```javascript
const fs = require('fs');
const csv = require('csv-parse/sync');

const filePath = 'C:/Users/hoang/OneDrive - TUM/Uni/26 SS/AI Agents in Practice/data-processors/02_process_execution_log.csv';
const content = fs.readFileSync(filePath, 'utf-8');

const records = csv.parse(content, {
  columns: true,
  skip_empty_lines: true
});

return records.map(record => ({
  json: {
    unit_id: record.unit_id?.trim() || '',
    process_id: record.process_id?.trim() || '',
    process_name: record.process_name?.trim() || '',
    start_date: record.start_date?.trim() || '',
    end_date: record.end_date?.trim() || '',
    duration_days: parseInt(record.duration_days) || 0,
    status: record.status?.trim() || 'COMPLETED',
    actor_id: record.actor_id?.trim() || '',
    cost_eur: parseFloat(record.cost_eur) || 0
  }
}));
```

**Neo4j Query 1 (Create Process):**
```cypher
MERGE (p:Process {unit_id: $unit_id, process_id: $process_id})
ON CREATE SET 
  p.process_name = $process_name,
  p.start_date = datetime($start_date),
  p.end_date = datetime($end_date),
  p.duration_days = $duration_days,
  p.status = $status,
  p.cost_eur = $cost_eur,
  p.created_at = datetime()
ON MATCH SET
  p.process_name = $process_name,
  p.cost_eur = $cost_eur,
  p.status = $status
RETURN p.unit_id, p.process_id
```

**Neo4j Query 2 (ChargingStation → Process):**
```cypher
MATCH (cs:ChargingStation {unit_id: $unit_id})
MATCH (p:Process {unit_id: $unit_id, process_id: $process_id})
MERGE (cs)-[:UNDERGOES]->(p)
RETURN cs.unit_id, p.process_id
```

**Neo4j Query 3 (Process → Actor):**
```cypher
MATCH (p:Process {unit_id: $unit_id, process_id: $process_id})
MATCH (a:Actor {actor_id: $actor_id})
MERGE (p)-[:EXECUTED_BY]->(a)
RETURN p.process_id, a.actor_name
```

---

### Workflow 05: Import Transport

**Function Node Code:**
```javascript
const fs = require('fs');
const csv = require('csv-parse/sync');

const filePath = 'C:/Users/hoang/OneDrive - TUM/Uni/26 SS/AI Agents in Practice/data-processors/04_transport_movements.csv';
const content = fs.readFileSync(filePath, 'utf-8');

const records = csv.parse(content, {
  columns: true,
  skip_empty_lines: true
});

return records.map(record => ({
  json: {
    transport_id: record.transport_id?.trim() || '',
    unit_id: record.unit_id?.trim() || '',
    route_from: record.route_from?.trim() || '',
    route_to: record.route_to?.trim() || '',
    mode: record.mode?.trim() || '',
    distance_km: parseInt(record.distance_km) || 0,
    cost_eur: parseFloat(record.cost_eur) || 0
  }
}));
```

**Neo4j Query 1 (Create Transport):**
```cypher
MERGE (t:Transport {transport_id: $transport_id})
ON CREATE SET 
  t.unit_id = $unit_id,
  t.route_from = $route_from,
  t.route_to = $route_to,
  t.mode = $mode,
  t.distance_km = $distance_km,
  t.cost_eur = $cost_eur,
  t.created_at = datetime()
ON MATCH SET
  t.route_from = $route_from,
  t.cost_eur = $cost_eur
RETURN t.transport_id, t.mode
```

**Neo4j Query 2 (Link Transport to Unit):**
```cypher
MATCH (t:Transport {transport_id: $transport_id})
MATCH (cs:ChargingStation {unit_id: $unit_id})
MERGE (t)-[:FOR_UNIT]->(cs)
RETURN t.transport_id, cs.unit_id
```

---

## 🧪 PHASE 4: Verification Queries

Run these queries in Neo4j to verify the data was successfully ingested:

```cypher
CALL {
  MATCH (a:Actor) RETURN COUNT(a) AS count, 'Actors' AS entity
}
CALL {
  MATCH (l:Location) RETURN COUNT(l) AS count, 'Locations' AS entity
}
CALL {
  MATCH (cs:ChargingStation) RETURN COUNT(cs) AS count, 'Units' AS entity
}
CALL {
  MATCH (p:Process) RETURN COUNT(p) AS count, 'Processes' AS entity
}
CALL {
  MATCH (t:Transport) RETURN COUNT(t) AS count, 'Transport' AS entity
}
RETURN entity, count
ORDER BY entity;
```

**Expected Results:**
- Actors: 17
- Locations: 6
- Processes: 400
- Transport: ~60
- Units: 20
