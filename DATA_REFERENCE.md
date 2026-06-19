# Dataset & Query Reference

This document provides a comprehensive overview of the synthetic dataset generated for the EV-Charger Lifecycle Project, as well as a reference of Neo4j Cypher queries for data analysis and AI agent training.

---

## 📊 Dataset Overview

### Data Statistics
- **Units Tracked:** 20 charging stations (EVC-2024-0001 to EVC-2024-0020)
- **Processes:** 25 distinct process types across 6 lifecycle phases
- **Total Records:** 400+ process executions, 60 transport movements, 8 maintenance events
- **Time Span:** 12-year lifecycle per unit (2024-2036)
- **Actors:** 17 supply chain actors across 6 European countries

### File Manifest (in `data-processors/`)

**Structured Data**
- `01_charging_stations.csv` (20 units)
- `02_process_execution_log.csv` (400 records)
- `03_actors_reference.csv` (17 orgs)
- `04_transport_movements.csv` (60 journeys)

**Semi-Structured & Unstructured Data**
- `05_vde_test_reports.csv` (3 quality reports)
- `06_maintenance_log.csv` (8 service visits)
- `07_field_notes_installation_001.md` (Technician notes)
- `08_incident_report_008.txt` (Incident analysis)
- `09_lca_report_summary.txt` (Environmental assessment)
- `10_supplier_quality_audit.txt` (Supplier compliance)

---

## 🔍 Neo4j Query Reference

### 1. Data Validation & Summary

**Complete Data Summary**
```cypher
CALL { MATCH (cs:ChargingStation) RETURN COUNT(cs) AS units, 'ChargingStations' AS entity_type }
CALL { MATCH (p:Process) RETURN COUNT(p) AS units, 'Processes' AS entity_type }
CALL { MATCH (a:Actor) RETURN COUNT(a) AS units, 'Actors' AS entity_type }
CALL { MATCH (l:Location) RETURN COUNT(l) AS units, 'Locations' AS entity_type }
RETURN entity_type, units ORDER BY entity_type;
```

**Verify All Relationships**
```cypher
CALL { MATCH ()-[r:UNDERGOES]->() RETURN COUNT(r) AS count, 'UNDERGOES' AS rel_type }
CALL { MATCH ()-[r:EXECUTED_BY]->() RETURN COUNT(r) AS count, 'EXECUTED_BY' AS rel_type }
CALL { MATCH ()-[r:LOCATED_IN]->() RETURN COUNT(r) AS count, 'LOCATED_IN' AS rel_type }
CALL { MATCH ()-[r:FOR_UNIT]->() RETURN COUNT(r) AS count, 'FOR_UNIT' AS rel_type }
RETURN rel_type, count ORDER BY count DESC;
```

---

### 2. Lifecycle Tracing

**Trace Single Unit (End-to-End)**
```cypher
MATCH (cs:ChargingStation {unit_id: 'EVC-2024-0001'})
-[:UNDERGOES]->(p:Process)
-[:EXECUTED_BY]->(a:Actor)
WITH cs, COLLECT({
  process: p.process_id,
  name: p.process_name,
  phase: p.lifecycle_phase,
  cost: p.cost_eur,
  executor: a.actor_name
} ORDER BY p.process_id) AS processes
RETURN 
  cs.unit_id,
  cs.country,
  LENGTH(processes) AS total_processes,
  REDUCE(total = 0, p IN processes | total + p.cost) AS total_cost,
  processes;
```

**Compare Lifecycle of Multiple Units**
```cypher
MATCH (cs:ChargingStation)
-[:UNDERGOES]->(p:Process)
WHERE cs.unit_id IN ['EVC-2024-0001', 'EVC-2024-0002', 'EVC-2024-0003']
WITH cs, COLLECT(p) AS processes
RETURN 
  cs.unit_id,
  cs.country,
  LENGTH(processes) AS process_count,
  ROUND(SUM(p.cost_eur), 2) AS lifecycle_cost
ORDER BY lifecycle_cost DESC;
```

---

### 3. Cost Analysis

**Total Lifecycle Cost Per Unit**
```cypher
MATCH (cs:ChargingStation)<-[:UNDERGOES]-(p:Process)
WITH cs, SUM(p.cost_eur) AS unit_total_cost
RETURN cs.unit_id, cs.country, ROUND(unit_total_cost, 2) AS lifecycle_cost_eur
ORDER BY unit_total_cost DESC;
```

**Cost by Actor (Supply Chain Spend)**
```cypher
MATCH (a:Actor)<-[:EXECUTED_BY]-(p:Process)
RETURN 
  a.actor_name,
  a.country,
  COUNT(p) AS process_count,
  ROUND(SUM(p.cost_eur), 2) AS total_spend_eur
ORDER BY total_spend_eur DESC;
```

---

### 4. Supply Chain Analytics

**Identify Single-Source Dependencies (Risk)**
```cypher
MATCH (a:Actor)<-[:EXECUTED_BY]-(p:Process)<-[:UNDERGOES]-(cs:ChargingStation)
WITH a.actor_name, COUNT(DISTINCT cs) AS units_served
WHERE units_served < 3
RETURN a.actor_name, units_served,
  CASE 
    WHEN units_served = 1 THEN 'CRITICAL RISK'
    ELSE 'HIGH RISK'
  END AS risk_level
ORDER BY units_served ASC;
```

**Multi-Country Supply Chain Flows**
```cypher
MATCH (a:Actor)-[:EXECUTED_BY]-(p:Process)
MATCH (cs:ChargingStation)-[:UNDERGOES]->(p)
MATCH (cs)-[:LOCATED_IN]->(l:Location)
WITH a.country AS origin, l.country AS destination, COUNT(p) AS movements
WHERE origin <> destination
RETURN origin, destination, movements
ORDER BY movements DESC;
```

---

### 5. Performance & Optimization

**Process Efficiency Ranking**
```cypher
MATCH (p:Process)
RETURN 
  p.process_name,
  COUNT(p) AS occurrences,
  ROUND(AVG(p.duration_days), 1) AS avg_duration_days,
  ROUND(AVG(p.cost_eur), 2) AS avg_cost_eur,
  ROUND(AVG(p.cost_eur) / NULLIF(AVG(p.duration_days), 0), 2) AS cost_per_day_eur
ORDER BY cost_per_day_eur DESC LIMIT 10;
```

**Bottleneck Detection (Slow AND Expensive)**
```cypher
MATCH (p:Process)
WHERE p.duration_days > (MATCH (all_p:Process) RETURN AVG(all_p.duration_days))
AND p.cost_eur > (MATCH (all_p:Process) RETURN AVG(all_p.cost_eur))
RETURN 
  p.process_name,
  ROUND(AVG(p.duration_days), 1) AS avg_duration_days,
  ROUND(AVG(p.cost_eur), 2) AS avg_cost_eur
ORDER BY avg_duration_days DESC;
```

---

### 6. AI Agent Training Examples

**Query Agent - Find Similar Units**
```cypher
MATCH (cs1:ChargingStation {unit_id: 'EVC-2024-0001'})-[:UNDERGOES]->(p1:Process)
WITH cs1, COUNT(DISTINCT p1.process_name) AS processes_1
MATCH (cs2:ChargingStation)-[:UNDERGOES]->(p2:Process)
WITH cs1, cs2, COUNT(DISTINCT p2.process_name) AS processes_2, processes_1
WHERE cs1 <> cs2 AND processes_1 = processes_2
RETURN cs1.unit_id AS ref_unit, cs2.unit_id AS similar_unit
LIMIT 5;
```

**Anomaly Detection - High Cost Processes**
```cypher
MATCH (cs:ChargingStation)-[:UNDERGOES]->(p:Process)
WHERE p.cost_eur > 2000
RETURN cs.unit_id, p.process_name, p.cost_eur, 'INVESTIGATE' AS action_flag
ORDER BY p.cost_eur DESC;
```
