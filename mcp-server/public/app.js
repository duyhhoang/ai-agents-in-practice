// --- STATE MANAGEMENT ---
const state = {
  activeTab: 'dashboard',
  units: [],
  selectedUnit: null,
  network: null,
  nodesDataset: null,
  edgesDataset: null,
  selectedNode: null,
  selectedFile: null,
  chatHistory: []
};

// --- CONFIGURATION ---
const API_BASE = window.location.origin;

// --- CHART INSTANCES ---
let bottleneckChartInstance = null;
let actorSpendChartInstance = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  switchTab('dashboard');
  refreshData();
});

function setupEventListeners() {
  // File Upload Drag & Drop
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--color-accent)';
      dropZone.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
    });
    
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border-color)';
      dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-color)';
      dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
      
      if (e.dataTransfer.files.length > 0) {
        setSelectedFile(e.dataTransfer.files[0]);
      }
    });
    
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        setSelectedFile(e.target.files[0]);
      }
    });
  }
}

// --- TAB ROUTING ---
const tabMetadata = {
  dashboard: { title: 'Lifecycle Dashboard', desc: 'Monitor supply chain metrics and unit lifecycles.' },
  ingestion: { title: 'Data Ingestion Control', desc: 'Upload datasets and trigger n8n processing pipelines.' },
  explorer: { title: 'Network Explorer', desc: 'Interact with the supply chain knowledge graph.' },
  chat: { title: 'Strategy Chat Assistant', desc: 'Query the graph database using conversational AI.' }
};

function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Update view sections
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  const activeView = document.getElementById(`tab-${tabId}`);
  if (activeView) activeView.classList.add('active');
  
  // Update header text
  const meta = tabMetadata[tabId];
  if (meta) {
    document.getElementById('current-tab-title').innerText = meta.title;
    document.getElementById('current-tab-desc').innerText = meta.desc;
  }

  // Specific tab initializations
  if (tabId === 'explorer' && !state.network) {
    setTimeout(initNetworkGraph, 100);
  }
}

// --- GLOBAL REFRESH ---
async function refreshData() {
  await loadDatabaseStats();
  if (state.activeTab === 'dashboard') {
    await loadDashboardMetrics();
  } else if (state.activeTab === 'ingestion') {
    await loadIngestionFiles();
  } else if (state.activeTab === 'explorer') {
    await reloadGraph();
  }
}

// --- DATABASE STATISTICS ---
async function loadDatabaseStats() {
  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          MATCH (cs:ChargingStation) RETURN 'ChargingStation' AS label, COUNT(cs) AS count
          UNION
          MATCH (p:Process) RETURN 'Process' AS label, COUNT(p) AS count
          UNION
          MATCH (a:Actor) RETURN 'Actor' AS label, COUNT(a) AS count
          UNION
          MATCH (l:Location) RETURN 'Location' AS label, COUNT(l) AS count
        `
      })
    });
    const data = await res.json();
    if (data.results) {
      let totalNodes = 0;
      data.results.forEach(row => {
        const count = row.count || 0;
        totalNodes += count;
        if (row.label === 'ChargingStation') {
          document.getElementById('stat-stations').innerText = count;
        } else if (row.label === 'Process') {
          document.getElementById('stat-processes').innerText = count;
        } else if (row.label === 'Actor') {
          document.getElementById('stat-actors').innerText = count;
        } else if (row.label === 'Location') {
          document.getElementById('stat-locations').innerText = count;
        }
      });
      document.getElementById('db-stats-summary').innerText = `${totalNodes} total nodes loaded`;
      const indicator = document.querySelector('.status-indicator');
      indicator.className = 'status-indicator online';
    }
  } catch (err) {
    console.error('Failed to load database status:', err);
    document.getElementById('db-stats-summary').innerText = 'Neo4j connection error';
    const indicator = document.querySelector('.status-indicator');
    indicator.className = 'status-indicator offline';
  }
}

// --- DASHBOARD LOADERS ---
async function loadDashboardMetrics() {
  await loadUnitsDropdown();
  await renderBottlenecks();
  await renderActorSpend();
  await renderSingleSourceRisks();
}

async function loadUnitsDropdown() {
  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'MATCH (cs:ChargingStation) RETURN cs.unit_id AS unit_id ORDER BY unit_id' })
    });
    const data = await res.json();
    if (data.results) {
      const select = document.getElementById('unit-select');
      const currentValue = select.value;
      select.innerHTML = '<option value="">Select a Unit...</option>';
      data.results.forEach(row => {
        const opt = document.createElement('option');
        opt.value = row.unit_id;
        opt.innerText = row.unit_id;
        select.appendChild(opt);
      });
      if (currentValue) select.value = currentValue;
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadUnitLifecycle() {
  const unitId = document.getElementById('unit-select').value;
  const container = document.getElementById('lifecycle-timeline-container');
  const meta = document.getElementById('unit-meta-summary');
  
  if (!unitId) {
    container.className = 'timeline-empty';
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-charging-station"></i>
        <p>Select a charging station unit above to trace its entire 25-stage lifecycle.</p>
      </div>`;
    meta.classList.add('hidden');
    return;
  }

  container.className = '';
  container.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Tracing lifecycle processes...</div>';
  
  try {
    // 1. Fetch metadata summary
    const resMeta = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          MATCH (cs:ChargingStation {unit_id: $unitId})
          OPTIONAL MATCH (cs)-[:UNDERGOES]->(p:Process)
          RETURN 
            cs.country AS country,
            coalesce(SUM(p.cost_eur), 0) AS total_cost,
            coalesce(SUM(p.duration_days), 0) AS total_duration
        `,
        params: { unitId }
      })
    });
    const metaData = await resMeta.json();
    if (metaData.results && metaData.results.length > 0) {
      const r = metaData.results[0];
      document.getElementById('unit-meta-country').innerText = r.country || 'Unknown';
      document.getElementById('unit-meta-cost').innerText = `€${parseFloat(r.total_cost).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      document.getElementById('unit-meta-duration').innerText = `${r.total_duration} days`;
      meta.classList.remove('hidden');
    }

    // 2. Fetch processes in lifecycle order
    const resProc = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          MATCH (cs:ChargingStation {unit_id: $unitId})-[:UNDERGOES]->(p:Process)
          OPTIONAL MATCH (p)-[:EXECUTED_BY]->(a:Actor)
          RETURN p.process_id AS process_id, p.process_name AS name, p.lifecycle_phase AS phase, 
                 p.cost_eur AS cost, p.duration_days AS duration, p.status AS status, a.actor_name AS actor
          ORDER BY p.process_id ASC
        `,
        params: { unitId }
      })
    });
    const procData = await resProc.json();
    
    if (procData.results && procData.results.length > 0) {
      let html = '<div class="timeline-scroll-container"><div class="timeline-track">';
      procData.results.forEach(p => {
        const isCompleted = p.status === 'COMPLETED';
        const isProgress = p.status === 'IN_PROGRESS';
        let stepClass = '';
        if (isCompleted) stepClass = 'completed';
        else if (isProgress) stepClass = 'in-progress';
        
        const shortPhase = p.phase ? p.phase.split(' - ')[0] : 'Phase';
        
        html += `
          <div class="timeline-step ${stepClass}" onclick="showTimelineDetail('${p.process_id}', '${escapeHtml(p.name)}', '${escapeHtml(p.phase)}', ${p.cost}, ${p.duration}, '${p.status}', '${escapeHtml(p.actor || 'N/A')}')">
            <div class="timeline-node">${p.process_id}</div>
            <div class="timeline-info">
              <p>${escapeHtml(shortPhase)}</p>
              <h4>${escapeHtml(p.name)}</h4>
              <div class="step-cost">€${p.cost}</div>
            </div>
          </div>
        `;
      });
      html += '</div></div>';
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="timeline-empty"><p>No process executions found for this unit. Ingest dataset first.</p></div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="timeline-empty"><p class="text-danger">Error: ${err.message}</p></div>`;
  }
}

function showTimelineDetail(id, name, phase, cost, duration, status, actor) {
  // Show standard info popup
  alert(`[Process: ${id}] ${name}\nPhase: ${phase}\nExecuted By: ${actor}\nCost: €${cost.toLocaleString()}\nDuration: ${duration} days\nStatus: ${status}`);
}

async function renderBottlenecks() {
  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          MATCH (p:Process)
          RETURN p.process_name AS name, ROUND(AVG(p.duration_days), 1) AS avg_duration
          ORDER BY avg_duration DESC
          LIMIT 5
        `
      })
    });
    const data = await res.json();
    if (data.results) {
      const labels = data.results.map(r => r.name);
      const values = data.results.map(r => r.avg_duration);
      
      const ctx = document.getElementById('bottleneckChart').getContext('2d');
      if (bottleneckChartInstance) bottleneckChartInstance.destroy();
      
      bottleneckChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Avg Duration (Days)',
            data: values,
            backgroundColor: 'rgba(6, 182, 212, 0.4)',
            borderColor: 'var(--color-info)',
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' } },
            x: { grid: { display: false }, ticks: { color: 'var(--text-secondary)', maxRotation: 45, minRotation: 45 } }
          }
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function renderActorSpend() {
  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          MATCH (a:Actor)<-[:EXECUTED_BY]-(p:Process)
          RETURN a.actor_name AS name, SUM(p.cost_eur) AS total_spend
          ORDER BY total_spend DESC
          LIMIT 5
        `
      })
    });
    const data = await res.json();
    if (data.results) {
      const labels = data.results.map(r => r.name);
      const values = data.results.map(r => r.total_spend);
      
      const ctx = document.getElementById('actorSpendChart').getContext('2d');
      if (actorSpendChartInstance) actorSpendChartInstance.destroy();
      
      actorSpendChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: [
              'rgba(99, 102, 241, 0.5)',
              'rgba(6, 182, 212, 0.5)',
              'rgba(16, 185, 129, 0.5)',
              'rgba(234, 179, 8, 0.5)',
              'rgba(168, 85, 247, 0.5)'
            ],
            borderColor: 'var(--bg-secondary)',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: 'var(--text-primary)', font: { size: 11 } } } }
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function renderSingleSourceRisks() {
  const container = document.getElementById('risk-list');
  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          MATCH (a:Actor)<-[:EXECUTED_BY]-(p:Process)<-[:UNDERGOES]-(cs:ChargingStation)
          WITH a.actor_name AS actor, COUNT(DISTINCT cs) AS units_served
          WHERE units_served < 3
          RETURN actor, units_served
          ORDER BY units_served ASC
        `
      })
    });
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      let html = '';
      data.results.forEach(row => {
        const riskLevel = row.units_served === 1 ? 'critical' : 'high';
        html += `
          <div class="risk-card-item">
            <div class="risk-actor-info">
              <span class="risk-actor-name">${escapeHtml(row.actor)}</span>
              <span class="risk-actor-count">Serves only ${row.units_served} unit(s)</span>
            </div>
            <span class="badge-risk ${riskLevel}">${riskLevel}</span>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state"><p>No single-source supplier risks detected.</p></div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="text-danger">Error: ${err.message}</div>`;
  }
}

// --- DATA INGESTION ---
async function loadIngestionFiles() {
  const container = document.getElementById('ingestion-file-list');
  try {
    const res = await fetch(`${API_BASE}/api/ingestion/status`);
    const files = await res.json();
    
    if (files && files.length > 0) {
      let html = '';
      files.forEach(f => {
        const badgeClass = f.processed ? 'processed' : 'pending';
        const badgeText = f.processed ? 'Cached' : 'Pending';
        const fileIcon = f.name.endsWith('.csv') ? 'fa-file-csv' : 'fa-file-lines';
        
        html += `
          <div class="file-item">
            <div class="file-info">
              <i class="fa-solid ${fileIcon}"></i>
              <div class="file-details">
                <h4>${escapeHtml(f.name)}</h4>
                <p>Hash: ${f.hash ? f.hash.substring(0, 16) + '...' : 'N/A'}</p>
              </div>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state"><p>No dataset files found in repository.</p></div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="text-danger">Error fetching repository files: ${err.message}</div>`;
  }
}

function setSelectedFile(file) {
  state.selectedFile = file;
  document.getElementById('selected-file-name').innerText = file.name;
  document.getElementById('file-selected-info').classList.remove('hidden');
  document.getElementById('upload-submit-btn').removeAttribute('disabled');
}

function clearSelectedFile() {
  state.selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('file-selected-info').classList.add('hidden');
  document.getElementById('upload-submit-btn').setAttribute('disabled', 'true');
}

async function handleUpload(event) {
  event.preventDefault();
  if (!state.selectedFile) return;

  const btn = document.getElementById('upload-submit-btn');
  btn.setAttribute('disabled', 'true');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';

  const formData = new FormData();
  formData.append('file', state.selectedFile);

  try {
    const res = await fetch(`${API_BASE}/api/ingestion/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (res.ok) {
      appendConsoleLine('success', `File "${state.selectedFile.name}" uploaded successfully!`);
      clearSelectedFile();
      await loadIngestionFiles();
    } else {
      const err = await res.text();
      appendConsoleLine('error', `Failed to upload: ${err}`);
    }
  } catch (err) {
    appendConsoleLine('error', `Network error during upload: ${err.message}`);
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload to Repository';
    btn.removeAttribute('disabled');
  }
}

async function triggerIngestion() {
  const btn = document.getElementById('run-pipeline-btn');
  if (btn) {
    btn.setAttribute('disabled', 'true');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running...';
  }
  
  const badge = document.getElementById('pipeline-status-badge');
  badge.className = 'badge pending';
  badge.innerText = 'Running';
  
  appendConsoleLine('info', 'Triggering n8n pipeline execution...');
  
  try {
    const res = await fetch(`${API_BASE}/api/ingestion/trigger`, { method: 'POST' });
    const data = await res.json();
    
    if (data.success) {
      appendConsoleLine('success', `Pipeline completed successfully in ${data.duration_ms}ms.`);
      appendConsoleLine('system', `Imported ${data.processed_files} new files.`);
      badge.className = 'badge processed';
      badge.innerText = 'Complete';
      await refreshData();
    } else {
      appendConsoleLine('error', `Pipeline failed: ${data.error}`);
      badge.className = 'badge pending';
      badge.innerText = 'Failed';
    }
  } catch (err) {
    appendConsoleLine('error', `Failed to contact backend: ${err.message}`);
    badge.className = 'badge pending';
    badge.innerText = 'Offline';
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.innerHTML = '<i class="fa-solid fa-play"></i> Run n8n Pipeline';
    }
  }
}

function appendConsoleLine(type, text) {
  const consoleBody = document.getElementById('pipeline-console');
  if (consoleBody) {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    consoleBody.appendChild(line);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }
}

// --- NETWORK EXPLORER ---
// --- NETWORK EXPLORER ---
const nodeColors = {
  ChargingStation: '#0284c7', // Sky blue
  Process: '#059669',         // Emerald green
  Actor: '#d97706',           // Amber orange
  Location: '#7c3aed',        // Violet purple
  Transport: '#db2777',       // Pink
  Material: '#10b981',        // Emerald-like Material
  Node: '#94a3b8'             // Default slate
};

function getNodeColor(label) {
  return nodeColors[label] || nodeColors.Node;
}

function initNetworkGraph() {
  const container = document.getElementById('network-canvas');
  state.nodesDataset = new vis.DataSet();
  state.edgesDataset = new vis.DataSet();
  
  const data = {
    nodes: state.nodesDataset,
    edges: state.edgesDataset
  };
  
  const options = {
    nodes: {
      shape: 'dot',
      size: 16,
      font: { color: '#0f172a', size: 12, face: 'Inter' },
      borderWidth: 2,
      shadow: true
    },
    edges: {
      width: 1.5,
      color: { color: 'rgba(15, 23, 42, 0.15)', hover: 'var(--color-accent)', highlight: 'var(--color-accent)' },
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
      smooth: { type: 'continuous' }
    },
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springLength: 100, springConstant: 0.08 }
    },
    interaction: { hover: true, tooltipDelay: 200 }
  };
  
  state.network = new vis.Network(container, data, options);
  
  state.network.on('click', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      showNodeDetails(nodeId);
    }
  });

  state.network.on('doubleClick', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      expandNode(nodeId);
    }
  });
}

async function reloadGraph() {
  const query = document.getElementById('node-search-input').value.trim();
  const depth = parseInt(document.getElementById('graph-depth').value) || 2;
  
  if (!state.nodesDataset) return;
  
  state.nodesDataset.clear();
  state.edgesDataset.clear();
  
  try {
    let cypher = '';
    let params = {};
    
    if (query) {
      cypher = `
        MATCH (start)
        WHERE (start.actor_name =~ $regex OR start.unit_id =~ $regex OR start.process_name =~ $regex OR start.location_code =~ $regex)
        AND NOT start:ProcessedFile
        LIMIT 5
        CALL apoc.path.subgraphAll(start, { maxLevel: $depth })
        YIELD nodes, relationships
        RETURN 
          [n IN nodes | {
            id: coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.process_id, n.id),
            label: labels(n)[0],
            properties: properties(n)
          }] AS nodes,
          [r IN relationships | {
            source: coalesce(startNode(r).actor_id, startNode(r).location_code, startNode(r).unit_id, startNode(r).material_id, startNode(r).process_id, startNode(r).id),
            target: coalesce(endNode(r).actor_id, endNode(r).location_code, endNode(r).unit_id, endNode(r).material_id, endNode(r).process_id, endNode(r).id),
            type: type(r)
          }] AS relationships
      `;
      params = { regex: `(?i).*${query}.*`, depth };
    } else {
      cypher = `
        MATCH (start:ChargingStation)
        LIMIT 5
        CALL apoc.path.subgraphAll(start, { maxLevel: $depth })
        YIELD nodes, relationships
        RETURN 
          [n IN nodes | {
            id: coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.process_id, n.id),
            label: labels(n)[0],
            properties: properties(n)
          }] AS nodes,
          [r IN relationships | {
            source: coalesce(startNode(r).actor_id, startNode(r).location_code, startNode(r).unit_id, startNode(r).material_id, startNode(r).process_id, startNode(r).id),
            target: coalesce(endNode(r).actor_id, endNode(r).location_code, endNode(r).unit_id, endNode(r).material_id, endNode(r).process_id, endNode(r).id),
            type: type(r)
          }] AS relationships
      `;
      params = { depth };
    }

    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cypher, params })
    });
    const data = await res.json();
    
    if (data.results && data.results.length > 0) {
      const nodesMap = new Map();
      const edgesMap = new Map();
      
      data.results.forEach(row => {
        if (row.nodes) {
          row.nodes.forEach(n => {
            const mappedColor = getNodeColor(n.label);
            
            nodesMap.set(n.id, {
              id: n.id,
              label: n.properties.name || n.properties.actor_name || n.properties.location_name || n.properties.process_name || n.properties.unit_id || n.id,
              color: { background: mappedColor, border: 'rgba(0,0,0,0.05)' },
              properties: n.properties,
              nodeLabel: n.label
            });
          });
        }
        if (row.relationships) {
          row.relationships.forEach(r => {
            const parsedEdge = {
              id: `${r.source}-${r.type}-${r.target}`,
              from: r.source,
              to: r.target,
              label: r.type
            };
            edgesMap.set(parsedEdge.id, parsedEdge);
          });
        }
      });
      
      state.nodesDataset.add(Array.from(nodesMap.values()));
      state.edgesDataset.add(Array.from(edgesMap.values()));
      
      setTimeout(() => state.network.fit(), 150);
    }
  } catch (err) {
    console.error(err);
  }
}

function parseNeo4jNode(n) {
  const label = n.labels ? (n.labels[0] || 'Node') : (n.label || 'Node');
  let id = n.elementId || n.id;
  let name = '';
  const color = getNodeColor(label);
  
  if (label === 'ChargingStation') {
    id = n.properties.unit_id;
    name = n.properties.unit_id;
  } else if (label === 'Process') {
    id = n.properties.process_id;
    name = `${n.properties.process_id}: ${n.properties.process_name}`;
  } else if (label === 'Actor') {
    id = n.properties.actor_id;
    name = n.properties.actor_name;
  } else if (label === 'Location') {
    id = n.properties.location_code;
    name = n.properties.location_name || n.properties.location_code;
  } else if (label === 'Transport') {
    id = n.properties.transport_id;
    name = `${n.properties.transport_id}: ${n.properties.mode}`;
  }
  
  return {
    id: id,
    label: name || id,
    color: { background: color, border: 'rgba(0,0,0,0.05)' },
    properties: n.properties,
    nodeLabel: label
  };
}

function handleNodeSearch(event) {
  if (event.key === 'Enter') {
    reloadGraph();
  }
}

async function expandNode(nodeId) {
  const node = state.nodesDataset.get(nodeId);
  if (!node) return;
  
  const depth = 1;
  const entityType = node.nodeLabel;
  
  try {
    const res = await fetch(`${API_BASE}/api/subgraph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: nodeId, entity_type: entityType, depth })
    });
    const subgraph = await res.json();
    
    if (subgraph.nodes) {
      subgraph.nodes.forEach(n => {
        const mappedId = n.id;
        const mappedColor = getNodeColor(n.label);
        
        if (!state.nodesDataset.get(mappedId)) {
          state.nodesDataset.add({
            id: mappedId,
            label: n.properties.name || n.properties.actor_name || n.properties.location_name || n.properties.process_name || n.properties.unit_id || mappedId,
            color: { background: mappedColor, border: 'rgba(0,0,0,0.05)' },
            properties: n.properties,
            nodeLabel: n.label
          });
        }
      });
    }
    
    if (subgraph.relationships) {
      subgraph.relationships.forEach(r => {
        const edgeId = `${r.source}-${r.type}-${r.target}`;
        if (!state.edgesDataset.get(edgeId)) {
          state.edgesDataset.add({
            id: edgeId,
            from: r.source,
            to: r.target,
            label: r.type
          });
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
}

function showNodeDetails(nodeId) {
  const node = state.nodesDataset.get(nodeId);
  const panel = document.getElementById('node-details-panel');
  
  if (!node) return;
  
  let html = `<div class="details-list">`;
  html += `
    <div class="details-row">
      <span class="details-label">Node Label</span>
      <span class="details-value"><strong>${node.nodeLabel}</strong></span>
    </div>
  `;
  
  for (const [k, v] of Object.entries(node.properties)) {
    if (k === 'created_at' || k === 'hash') continue;
    html += `
      <div class="details-row">
        <span class="details-label">${k.replace(/_/g, ' ')}</span>
        <span class="details-value">${escapeHtml(String(v))}</span>
      </div>
    `;
  }
  
  html += `</div>`;
  panel.innerHTML = html;
}

function fitGraphView() {
  if (state.network) state.network.fit();
}

function clearGraphView() {
  if (state.nodesDataset) {
    state.nodesDataset.clear();
    state.edgesDataset.clear();
  }
}

// --- PLANTUML CODE MODAL ---
async function generatePlantUML() {
  if (!state.nodesDataset || state.nodesDataset.length === 0) {
    alert('Canvas is empty. Load some nodes first.');
    return;
  }
  
  const nodes = state.nodesDataset.get().map(n => ({
    id: n.id,
    label: n.nodeLabel,
    name: n.label
  }));
  
  const relationships = state.edgesDataset.get().map(e => ({
    source: e.from,
    target: e.to,
    type: e.label
  }));
  
  try {
    const res = await fetch(`${API_BASE}/api/diagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, relationships, diagram_type: 'dependency' })
    });
    const pumlText = await res.text();
    
    document.getElementById('plantuml-code').value = pumlText;
    document.getElementById('plantuml-modal').classList.remove('hidden');
    
    // Generate public PlantUML SVG URL
    // Public plantuml compressor
    const encodedPuml = encodePlantUML(pumlText);
    const svgUrl = `http://www.plantuml.com/plantuml/svg/${encodedPuml}`;
    document.getElementById('plantuml-img-container').innerHTML = `<img src="${svgUrl}" alt="PlantUML SVG Diagram">`;
  } catch (err) {
    alert(`Failed to generate PlantUML: ${err.message}`);
  }
}

function closePlantUMLModal() {
  document.getElementById('plantuml-modal').classList.add('hidden');
}

function copyPlantUMLText() {
  const txt = document.getElementById('plantuml-code');
  txt.select();
  document.execCommand('copy');
  alert('PlantUML code copied to clipboard.');
}

// Simple PlantUML compression function for rendering
function encodePlantUML(s) {
  // Simple UTF8-to-deflate compressor
  // Since we cannot run raw binary compression on browser JS without libs, we fall back
  // to a simpler base64 encoding scheme that modern PlantUML servers accept, 
  // or simple query escaping. Let's use standard hex encoder fallback for the public server
  try {
    const bytes = new TextEncoder().encode(s);
    let hex = '';
    bytes.forEach(b => {
      hex += b.toString(16).padStart(2, '0');
    });
    // PlantUML server accepts hexadecimal encoding prefixed with ~h
    return `~h${hex}`;
  } catch (e) {
    return encodeURIComponent(s);
  }
}

// --- STRATEGY CHAT ---
async function submitChatMessage() {
  const textarea = document.getElementById('chat-input');
  const messageText = textarea.value.trim();
  
  if (!messageText) return;
  
  textarea.value = '';
  
  // Render User bubble
  renderChatBubble('user', messageText);
  
  // Render loading response bubble
  const loaderId = appendChatLoader();
  
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: messageText })
    });
    const data = await res.json();
    
    removeChatLoader(loaderId);
    
    if (data.response) {
      if (data.agentThoughts && data.agentThoughts.length > 0) {
        renderAgentThoughtsTimeline(data.agentThoughts);
      }
      renderChatBubble('system', data.response);
    } else {
      renderChatBubble('system', `Error: ${data.error || 'Unknown response'}`);
    }
  } catch (err) {
    removeChatLoader(loaderId);
    renderChatBubble('system', `Failed to send query: ${err.message}`);
  }
}

function renderAgentThoughtsTimeline(thoughts) {
  const container = document.getElementById('chat-messages');
  
  const thoughtsWrapper = document.createElement('div');
  thoughtsWrapper.className = 'message system agent-thoughts-timeline-bubble';
  
  let thoughtsHtml = `
    <div class="avatar"><i class="fa-solid fa-users-gear"></i></div>
    <div class="message-content">
      <details class="agent-thoughts-details" open>
        <summary class="agent-thoughts-summary">
          <i class="fa-solid fa-brain"></i> Multi-Agent Strategic Analysis Log
        </summary>
        <div class="agent-thoughts-timeline">
  `;
  
  thoughts.forEach(t => {
    let iconClass = 'fa-user-gear';
    let labelClass = 'plan';
    if (t.role === 'plan') { iconClass = 'fa-route'; labelClass = 'plan'; }
    else if (t.role === 'db') { iconClass = 'fa-database'; labelClass = 'db'; }
    else if (t.role === 'ops') { iconClass = 'fa-gears'; labelClass = 'ops'; }
    else if (t.role === 'finance') { iconClass = 'fa-euro-sign'; labelClass = 'finance'; }
    
    thoughtsHtml += `
          <div class="agent-thought-item ${labelClass}">
            <div class="agent-thought-header">
              <span class="agent-icon"><i class="fa-solid ${iconClass}"></i></span>
              <strong class="agent-name">${escapeHtml(t.agent)}</strong>
            </div>
            <div class="agent-thought-body">${parseMarkdown(t.thought)}</div>
          </div>
    `;
  });
  
  thoughtsHtml += `
        </div>
      </details>
    </div>
  `;
  
  thoughtsWrapper.innerHTML = thoughtsHtml;
  container.appendChild(thoughtsWrapper);
  container.scrollTop = container.scrollHeight;
}

function renderChatBubble(sender, text) {
  const container = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `message ${sender}`;
  
  const icon = sender === 'user' ? 'fa-user' : 'fa-robot';
  
  // Convert markdown-style code/tables/links to HTML
  const formattedText = parseMarkdown(text);
  
  bubble.innerHTML = `
    <div class="avatar"><i class="fa-solid ${icon}"></i></div>
    <div class="message-content">${formattedText}</div>
  `;
  
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendChatLoader() {
  const id = 'loader-' + Date.now();
  const container = document.getElementById('chat-messages');
  const loader = document.createElement('div');
  loader.className = 'message system';
  loader.id = id;
  loader.innerHTML = `
    <div class="avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="message-content">
      <div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Writing response...</div>
    </div>
  `;
  container.appendChild(loader);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeChatLoader(id) {
  const loader = document.getElementById(id);
  if (loader) loader.remove();
}

function sendSuggestedPrompt(text) {
  switchTab('chat');
  document.getElementById('chat-input').value = text;
  submitChatMessage();
}

function handleChatSubmit(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitChatMessage();
  }
}

// --- HELPERS ---
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseMarkdown(text) {
  let html = text;
  
  // Escape HTML tags to protect injection
  html = escapeHtml(html);
  
  // Render tables
  const tableRegex = /\|(.+)\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+\|[\r\n]*)+)/g;
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
    const headers = headerRow.split('|').map(s => s.trim()).filter(s => s);
    let tableHtml = '<table><thead><tr>';
    headers.forEach(h => {
      tableHtml += `<th>${h}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
    const rows = bodyRows.split('\n').filter(r => r.trim());
    rows.forEach(r => {
      const cells = r.split('|').map(s => s.trim()).filter(s => s);
      tableHtml += '<tr>';
      cells.forEach(c => {
        tableHtml += `<td>${c}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
    return tableHtml;
  });

  // Render headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Render bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Render inline code blocks
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Render new lines to breaks (outside table constructs)
  html = html.split('\n').join('<br>');
  
  return html;
}
