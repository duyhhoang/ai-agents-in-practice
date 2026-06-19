# n8n Data Ingestion Workflow - Quick Reference

## Workflow Overview

This workflow demonstrates how to:
1. **Ingest CSV data** from local files
2. **Parse and transform** data into structured format
3. **Extract metadata** (source, timestamp, etc.)
4. **Write to Neo4j** knowledge graph

---

## Step-by-Step Workflow Design

### Phase 1: Data Ingestion (Trigger)

**Node Type:** Manual Trigger or File Read  
**Configuration:**
- Read CSV file from local directory
- Output: Array of objects (rows)

```javascript
// Example output from CSV read:
[
  {
    "id": "supplier_001",
    "name": "Chip Fab Inc",
    "country": "Taiwan",
    "lead_time_days": 30,
    "quality_score": 0.95
  },
  // ... more rows
]
```

---

### Phase 2: Data Transformation

**Node Type:** Function / Set Node  
**Purpose:** Add metadata and standardize format

```javascript
// Transform each row with metadata
items.map(item => ({
  ...item,
  source: "suppliers.csv",
  ingestion_timestamp: new Date().toISOString(),
  data_type: "Supplier"
}))
```

---

### Phase 3: Entity Type Detection

**Node Type:** Switch / If Statement  
**Purpose:** Route data to appropriate Neo4j node creation

```javascript
// Determine node type based on source or content
if (sourceFile.includes("supplier")) {
  return { type: "Supplier" };
} else if (sourceFile.includes("product")) {
  return { type: "Product" };
} else if (sourceFile.includes("process")) {
  return { type: "Process" };
}
```

---

### Phase 4: Neo4j Node Creation

**Node Type:** Execute Query (Neo4j Connector)  
**For each entity:**

```cypher
CREATE (s:Supplier {
  id: $id,
  name: $name,
  country: $country,
  lead_time_days: toInteger($lead_time_days),
  quality_score: toFloat($quality_score),
  contact_email: $contact_email,
  ingested_at: datetime()
})
RETURN s.id AS created_id, s.name AS created_name
```

**Parameters:** Map workflow data to Cypher variables

---

### Phase 5: Error Handling

**Node Type:** Catch Errors  
**Configuration:**
- Log errors to file or database
- Return status report

```javascript
{
  status: "success" or "error",
  processed_records: 5,
  failed_records: 0,
  timestamp: new Date().toISOString()
}
```

---

### Phase 6: Status Report

**Node Type:** HTTP Request or Webhook  
**Output:** JSON summary

```json
{
  "workflow": "data-ingestion",
  "status": "completed",
  "source": "suppliers.csv",
  "records_processed": 5,
  "records_created_in_neo4j": 5,
  "errors": 0,
  "timestamp": "2026-05-28T19:12:49Z"
}
```

---

## n8n Configuration Tips

### Neo4j Connector Setup
1. In n8n, go to **Credentials**
2. Create new **Neo4j** credential:
   - **Host:** localhost
   - **Port:** 7687
   - **Username:** neo4j
   - **Password:** neo4jPASSWORD
   - **Encryption:** false (for local testing)

### CSV File Reading
**Option 1:** File Trigger (when file appears in folder)  
**Option 2:** Manual Trigger + Read File node

### Recommended Workflow Structure

```
Manual Trigger
  ↓
Read CSV File
  ↓
Transform Data (add metadata)
  ↓
Split Data (process in batches)
  ↓
Neo4j: CREATE nodes (parallel)
  ↓
Collect Results
  ↓
Send Summary Report
```

---

## Testing Checklist

- [ ] Neo4j credentials working in n8n
- [ ] CSV file reading correctly
- [ ] Data transformation producing valid format
- [ ] Neo4j nodes being created
- [ ] Duplicate detection working
- [ ] Error messages logged
- [ ] Status report generated

---

## Sample Files Location

All sample CSV files are in: `data-processors/`
- `sample_suppliers.csv` - Test supplier data
- `sample_products.csv` - Test product data
- `sample_processes.csv` - Test process data

**Next Steps:**
1. Create Manual Trigger workflow
2. Add File Read node for suppliers.csv
3. Test data transformation
4. Connect to Neo4j
5. Execute and verify in Neo4j browser

