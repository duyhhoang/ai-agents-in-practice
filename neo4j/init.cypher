// ==========================================================================
// Supply Chain Knowledge Graph Schema Initialization
// Project: GenAI Agents for Supply Chain Analysis (TUM Practice Course)
// ==========================================================================
// This file contains the schema constraints, indexes, and relationship
// definitions for the EV Charger Lifecycle supply chain knowledge graph.
// Run this file against Neo4j 5.15+ Community/Enterprise.

// ============================================================================
// UNIQUENESS CONSTRAINTS (Data Integrity)
// ============================================================================

// ChargingStation: Each physical EV charging unit is uniquely identified
CREATE CONSTRAINT station_unique IF NOT EXISTS
  FOR (cs:ChargingStation) REQUIRE cs.unit_id IS UNIQUE;

// Process: Processes are unique per (unit_id, process_id) combination
// Note: process_id alone (e.g. P01) repeats across different charging stations
CREATE CONSTRAINT process_compound_key IF NOT EXISTS
  FOR (p:Process) REQUIRE (p.unit_id, p.process_id) IS UNIQUE;

// Actor: Supply chain organizations/entities
CREATE CONSTRAINT actor_unique IF NOT EXISTS
  FOR (a:Actor) REQUIRE a.actor_id IS UNIQUE;

// Location: Geographic locations
CREATE CONSTRAINT location_unique IF NOT EXISTS
  FOR (l:Location) REQUIRE l.location_code IS UNIQUE;

// Material: Raw materials and components
CREATE CONSTRAINT material_unique IF NOT EXISTS
  FOR (m:Material) REQUIRE m.material_id IS UNIQUE;

// Transport: Logistics movements
CREATE CONSTRAINT transport_unique IF NOT EXISTS
  FOR (t:Transport) REQUIRE t.transport_id IS UNIQUE;

// ============================================================================
// PROPERTY INDEXES (Query Performance)
// ============================================================================

CREATE INDEX charging_station_country IF NOT EXISTS
  FOR (cs:ChargingStation) ON (cs.country);

CREATE INDEX actor_country IF NOT EXISTS
  FOR (a:Actor) ON (a.country);

CREATE INDEX process_phase IF NOT EXISTS
  FOR (p:Process) ON (p.lifecycle_phase);

CREATE INDEX process_status IF NOT EXISTS
  FOR (p:Process) ON (p.status);

CREATE INDEX process_completion_date IF NOT EXISTS
  FOR (p:Process) ON (p.completion_date);

// ============================================================================
// NODE TYPE DEFINITIONS (Reference)
// ============================================================================

// ChargingStation
//   Properties: unit_id, serial_number, product_variant, manufacture_date,
//               country, installation_site_id

// Process
//   Properties: unit_id, process_id, process_name, lifecycle_phase,
//               start_date, end_date, duration_days, status, cost_eur

// Actor
//   Properties: actor_id, actor_name, region, country

// Location
//   Properties: location_code, location_name, country

// Transport
//   Properties: transport_id, unit_id, route_from, route_to, mode,
//               distance_km, cost_eur

// Material
//   Properties: material_id, material_name, description

// ProcessedFile (internal cache)
//   Properties: name, hash

// ============================================================================
// RELATIONSHIP TYPE DEFINITIONS
// ============================================================================

// (ChargingStation)-[:UNDERGOES]->(Process)     — Unit lifecycle steps
// (Process)-[:EXECUTED_BY]->(Actor)              — Who performed the process
// (ChargingStation)-[:LOCATED_IN]->(Location)    — Unit deployment location
// (Transport)-[:FOR_UNIT]->(ChargingStation)     — Logistics for a unit
// (Process)-[:USES_MATERIAL]->(Material)         — Materials consumed
// (Actor)-[:SUPPLIES]->(Material)                — Supplier relationships

// ============================================================================
// VALIDATION
// ============================================================================

RETURN "Neo4j schema initialized successfully. Ready for data ingestion." AS status;
