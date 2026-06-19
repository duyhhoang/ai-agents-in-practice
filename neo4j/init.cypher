// Supply Chain Knowledge Graph Schema Initialization
// This file contains the foundational schema for supply chain analysis

// ============================================================================
// CONSTRAINTS & INDEXES (Performance & Data Integrity)
// ============================================================================

// Unique constraints on entity IDs
CREATE CONSTRAINT IF NOT EXISTS FOR (supplier:Supplier) REQUIRE supplier.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (product:Product) REQUIRE product.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (process:Process) REQUIRE process.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (risk:Risk) REQUIRE risk.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (location:Location) REQUIRE location.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (constraint_node:Constraint) REQUIRE constraint_node.id IS UNIQUE;

// Full-text search indexes for entity names
CREATE INDEX IF NOT EXISTS supplier_name_idx FOR (supplier:Supplier) ON (supplier.name);
CREATE INDEX IF NOT EXISTS product_name_idx FOR (product:Product) ON (product.name);
CREATE INDEX IF NOT EXISTS process_name_idx FOR (process:Process) ON (process.name);

// Relationship indexes for common query patterns
CREATE INDEX IF NOT EXISTS supplier_type_idx FOR ()-[r:SUPPLIES]-() ON (r.type);
CREATE INDEX IF NOT EXISTS process_type_idx FOR ()-[r:EXECUTES]-() ON (r.type);

// ============================================================================
// NODE TYPE DEFINITIONS (with descriptions and example properties)
// ============================================================================

// SUPPLIER: Organizations providing components/materials
// Properties: id, name, country, reliability_score, lead_time_days, cost_per_unit
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Supplier) REQUIRE n.id IS NOT NULL;

// PRODUCT: Final products or intermediate components
// Properties: id, name, description, category, unit_price, critical (boolean)
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Product) REQUIRE n.id IS NOT NULL;

// PROCESS: Manufacturing/logistics processes
// Properties: id, name, description, duration_days, capacity, location
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Process) REQUIRE n.id IS NOT NULL;

// LOCATION: Geographic locations (factories, warehouses, markets)
// Properties: id, name, country, region, latitude, longitude
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Location) REQUIRE n.id IS NOT NULL;

// RISK: Supply chain risks (quality, demand, geopolitical, etc.)
// Properties: id, name, category, severity (low/medium/high), probability
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Risk) REQUIRE n.id IS NOT NULL;

// CONSTRAINT_NODE: Business constraints (budget, time, regulatory)
// Properties: id, name, type, description, impact
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Constraint) REQUIRE n.id IS NOT NULL;

// MATERIAL: Raw materials or intermediate goods
// Properties: id, name, supplier_id, unit_cost, lead_time_days
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Material) REQUIRE n.id IS NOT NULL;

// ============================================================================
// RELATIONSHIP TYPE DEFINITIONS (Semantic meaning)
// ============================================================================

// SUPPLIES: Supplier provides Product/Material
// Properties: cost, lead_time_days, quantity_min, quality_score

// USES: Process uses Product/Material
// Properties: quantity_required, unit, critical

// PRODUCES: Process produces Product
// Properties: quantity_per_batch, efficiency_rate

// EXECUTES: Organization executes Process
// Properties: start_date, end_date, status

// LOCATED_AT: Entity has physical location
// Properties: since (date)

// AFFECTED_BY: Entity affected by Risk
// Properties: impact_severity, mitigation_status

// DEPENDS_ON: Process/Product depends on another
// Properties: dependency_type (hard/soft), criticality

// PART_OF: Hierarchical composition
// Properties: percentage_weight, component_count

// MITIGATED_BY: Risk mitigated by Constraint
// Properties: effectiveness_score

// ============================================================================
// INITIAL DATA VALIDATION
// ============================================================================

// Verify Neo4j is up and running
RETURN "Neo4j instance initialized successfully. Ready for data ingestion." AS status;
