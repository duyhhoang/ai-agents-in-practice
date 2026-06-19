import http from "http";

const baseUrl = "http://localhost:3000";
const pendingRequests = new Map();

// Helper to make a POST request to the message endpoint
function postMessage(postUrl, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(postUrl, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 300) {
          reject(new Error(`POST failed with status ${res.statusCode}: ${data}`));
        } else {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

// Promisified tool call helper
function callTool(postUrl, id, method, params) {
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    postMessage(postUrl, payload).catch((err) => {
      pendingRequests.delete(id);
      reject(err);
    });
  });
}

// Main test execution
async function run() {
  console.log("Connecting to MCP SSE endpoint...");
  
  const req = http.request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/sse",
      headers: {
        Accept: "text/event-stream",
      },
    },
    (res) => {
      let buffer = "";
      let postUrl = "";
      let currentEvent = "";

      res.on("data", async (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        // Keep the last partial line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.slice(7).trim();
          } else if (trimmed.startsWith("data: ")) {
            const dataVal = trimmed.slice(6).trim();

            if (currentEvent === "endpoint") {
              postUrl = dataVal;
              console.log(`Received message POST endpoint: ${postUrl}`);
              
              // Start test sequence
              try {
                console.log("\n--- Testing list_tools ---");
                const listData = await callTool(postUrl, 1, "tools/list", {});
                console.log("Available tools:", listData.result?.tools?.map((t) => t.name));

                console.log("\n--- Testing call_tool (graph-query) ---");
                const queryData = await callTool(postUrl, 2, "tools/call", {
                  name: "graph-query",
                  arguments: {
                    query: "MATCH (f:ProcessedFile) RETURN f.name, f.hash LIMIT 5",
                  },
                });
                console.log("Tool result content:");
                console.log(queryData.result?.content?.[0]?.text);

                console.log("\n--- Testing call_tool (analytics) ---");
                const analyticsData = await callTool(postUrl, 3, "tools/call", {
                  name: "analytics",
                  arguments: {
                    analysis_type: "centrality"
                  },
                });
                console.log("Analytics result content:");
                console.log(analyticsData.result?.content?.[0]?.text);

                console.log("\nAll tests completed successfully!");
                res.destroy(); // Close SSE stream
                process.exit(0);
              } catch (err) {
                console.error("Test sequence failed:", err);
                res.destroy();
                process.exit(1);
              }
            } else if (currentEvent === "message") {
              // Parse JSON-RPC response
              try {
                const response = JSON.parse(dataVal);
                const id = response.id;
                if (id && pendingRequests.has(id)) {
                  const { resolve, reject } = pendingRequests.get(id);
                  pendingRequests.delete(id);
                  if (response.error) {
                    reject(new Error(JSON.stringify(response.error)));
                  } else {
                    resolve(response);
                  }
                }
              } catch (e) {
                console.warn("Could not parse message data as JSON:", e);
              }
            }
          }
        }
      });

      res.on("error", (err) => {
        console.error("SSE stream error:", err);
        process.exit(1);
      });
    }
  );

  req.on("error", (err) => {
    console.error("Failed to connect to SSE server:", err);
    process.exit(1);
  });

  req.end();
}

run();
