// action execution — runs the tools daimon calls
// daimon: you can ADD new handlers here. go wild.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { ethers } = require("ethers");
const { REPO_ROOT, DAIMON_WALLET_KEY, BASE_RPC } = require("./config");
const { githubAPI, addToProject } = require("./github");
const { register, heartbeat, getAllDaimons, isRegistered, getRegistryAddress } = require("./network");

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const filesChanged = new Set();

// Registry ABI for onchain operations
const REGISTRY_ABI = [
  "function agents(address) external view returns (string repoUrl, address wallet, string name, uint256 registeredAt, uint256 lastSeen)",
];

// executes a tool call and returns the result string
async function executeTool(name, args) {
  switch (name) {
    case "write_file": {
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content, "utf-8");
      filesChanged.add(args.path);
      log(`wrote: ${args.path} (${args.content.length} chars)`);
      return `wrote ${args.path} (${args.content.length} chars)`;
    }
    case "append_file": {
      // block append on JSON files — corrupts them
      if (args.path.endsWith(".json")) {
        log(`blocked append_file on JSON: ${args.path}`);
        return `error: cannot append to JSON files — use write_file() with the full valid JSON instead. read the file first, modify it, then write_file() the complete content.`;
      }
      // block append to old daily journal format
      if (/^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(args.path)) {
        log(`blocked append to deprecated daily journal: ${args.path}`);
        return `error: daily journal format (memory/YYYY-MM-DD.md) is deprecated. write your journal to memory/cycles/<cycle_number>.md instead using write_file().`;
      }
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.appendFileSync(fullPath, "\n" + args.content, "utf-8");
      filesChanged.add(args.path);
      log(`appended: ${args.path}`);
      return `appended to ${args.path}`;
    }
    case "read_file": {
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      if (!fs.existsSync(fullPath)) return `file not found: ${args.path}`;
      const raw = fs.readFileSync(fullPath, "utf-8");
      const lines = raw.split("\n");
      const totalLines = lines.length;

      // support offset/limit for partial reads
      const offset = Math.max(1, args.offset || 1);
      const limit = args.limit || totalLines;
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const content = slice.join("\n");

      const rangeInfo = args.offset || args.limit
        ? ` (lines ${offset}-${offset + slice.length - 1} of ${totalLines})`
        : "";
      log(`read: ${args.path}${rangeInfo} (${content.length} chars)`);
      return content.length > 4000
        ? content.slice(0, 4000) + `\n... (truncated, ${totalLines} total lines)`
        : content + (rangeInfo ? `\n--- ${totalLines} total lines ---` : "");
    }
    case "create_issue": {
      const issue = await githubAPI("/issues", {
        method: "POST",
        body: JSON.stringify({
          title: args.title,
          body: args.body || "",
          labels: args.labels || [],
        }),
      });
      log(`created issue #${issue.number}: ${issue.title}`);
      if (issue.node_id) await addToProject(issue.node_id);
      return `created issue #${issue.number}: ${issue.title}`;
    }
    case "close_issue": {
      if (args.comment) {
        await githubAPI(`/issues/${args.number}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: args.comment }),
        });
      }
      await githubAPI(`/issues/${args.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      });
      log(`closed issue #${args.number}`);
      return `closed issue #${args.number}`;
    }
    case "comment_issue": {
      await githubAPI(`/issues/${args.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: args.body }),
      });
      log(`commented on issue #${args.number}`);
      return `commented on issue #${args.number}`;
    }
    case "web_search": {
      log(`web search: ${args.query}`);
      try {
        const q = encodeURIComponent(args.query);
        const res = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; daimon/1.0)" },
        });
        if (!res.ok) return `search failed: HTTP ${res.status}`;
        const html = await res.text();
        // extract results from DDG HTML
        const results = [];
        const regex = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 10) {
          results.push(match[1].trim());
        }
        if (results.length === 0) return "no results found";
        log(`web search: ${results.length} results`);
        return results.map((r, i) => `${i + 1}. ${r}`).join("\n");
      } catch (e) {
        return `search error: ${e.message}`;
      }
    }
    case "run_command": {
      // block git commands — commits happen automatically
      if (/\bgit\s+(add|commit|push)/.test(args.command)) {
        log(`blocked git command: ${args.command}`);
        return "git commands are blocked — commits happen automatically";
      }
      log(`running: ${args.command}`);
      try {
        const output = execSync(args.command, {
          cwd: REPO_ROOT,
          encoding: "utf-8",
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });
        log(`command succeeded (${output.length} chars)`);
        return output.trim() || "(no output)";
      } catch (e) {
        log(`command failed: ${e.message}`);
        if (e.stdout) return e.stdout.slice(0, 2000);
        return `error (exit ${e.status}): ${e.message.slice(0, 200)}`;
      }
    }
    case "list_dir": {
      const dirPath = args.path ? path.resolve(REPO_ROOT, args.path) : REPO_ROOT;
      if (!dirPath.startsWith(REPO_ROOT)) throw new Error("path escape attempt");
      if (!fs.existsSync(dirPath)) return `directory not found: ${args.path || "."}`;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const result = entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .join("\n");
      log(`listed: ${args.path || "."} (${entries.length} entries)`);
      return result || "(empty)";
    }
    case "search_files": {
      log(`searching for: ${args.pattern} in ${args.path || "."}`);
      try {
        const basePath = args.path ? path.resolve(REPO_ROOT, args.path) : REPO_ROOT;
        if (!basePath.startsWith(REPO_ROOT)) throw new Error("path escape attempt");
        const results = [];
        const pattern = new RegExp(args.pattern, "i");
        const walk = (dir) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (entry.isFile()) {
              if (args.glob && !entry.name.match(args.glob.replace(/\*/g, ".*"))) continue;
              try {
                const content = fs.readFileSync(full, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (pattern.test(lines[i])) {
                    const relPath = path.relative(REPO_ROOT, full);
                    results.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
                    if (results.length >= 50) break;
                  }
                }
              } catch {}
            }
            if (results.length >= 50) break;
          }
        };
        walk(basePath);
        if (results.length === 0) return "no matches found";
        log(`search: ${results.length} matches`);
        return results.join("\n");
      } catch (e) {
        if (e.status === 1) return "no matches found";
        return `search error: ${e.message.slice(0, 200)}`;
      }
    }
    case "delete_file": {
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      if (!fs.existsSync(fullPath)) return `file not found: ${args.path}`;
      fs.unlinkSync(fullPath);
      filesChanged.add(args.path);
      log(`deleted: ${args.path}`);
      return `deleted ${args.path}`;
    }
    case "fetch_url": {
      log(`fetching: ${args.url}`);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(args.url, {
          headers: { "User-Agent": "daimon/1.0" },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return `fetch failed: HTTP ${res.status}`;
        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        // if JSON, return as-is; if HTML, strip tags
        let content;
        if (contentType.includes("json")) {
          content = text;
        } else {
          content = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        log(`fetched: ${args.url} (${content.length} chars)`);
        return content.length > 4000
          ? content.slice(0, 4000) + "\n... (truncated)"
          : content;
      } catch (e) {
        return `fetch error: ${e.message}`;
      }
    }
    case "search_memory": {
      log(`searching memory for: ${args.query}`);
      try {
        const memDir = path.resolve(REPO_ROOT, "memory");
        // collect all searchable files: top-level + cycles/
        const topFiles = fs.readdirSync(memDir)
          .filter(f => f.endsWith(".md") || f.endsWith(".json"))
          .map(f => ({ rel: `memory/${f}`, full: path.join(memDir, f) }));
        const cyclesDir = path.join(memDir, "cycles");
        const cycleFiles = fs.existsSync(cyclesDir)
          ? fs.readdirSync(cyclesDir)
              .filter(f => f.endsWith(".md"))
              .map(f => ({ rel: `memory/cycles/${f}`, full: path.join(cyclesDir, f) }))
          : [];
        const allFiles = [...topFiles, ...cycleFiles];
        const results = [];
        let pattern;
        try {
          pattern = new RegExp(args.query, "i");
        } catch (e) {
          return `invalid search pattern: ${e.message}`;
        }
        for (const file of allFiles) {
          const content = fs.readFileSync(file.full, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              const start = Math.max(0, i - 1);
              const end = Math.min(lines.length - 1, i + 1);
              const snippet = lines.slice(start, end + 1).join("\n");
              results.push(`${file.rel}:${i + 1}\n${snippet}`);
            }
          }
        }
        if (results.length === 0) return `no matches for "${args.query}" in memory/`;
        const output = results.slice(0, 20).join("\n---\n");
        log(`memory search: ${results.length} matches`);
        return output.length > 3000 ? output.slice(0, 3000) + "\n... (truncated)" : output;
      } catch (e) {
        return `memory search error: ${e.message}`;
      }
    }
    case "github_search": {
      const type = args.type || "repositories";
      log(`github search (${type}): ${args.query}`);
      try {
        const q = encodeURIComponent(args.query);
        const data = await githubAPI(
          `https://api.github.com/search/${type}?q=${q}&per_page=10`,
          { raw: true }
        );
        if (type === "repositories") {
          return (data.items || [])
            .map((r) => `${r.full_name}: ${r.description || "(no description)"}\n  ${r.html_url}`)
            .join("\n\n") || "no results";
        } else if (type === "code") {
          return (data.items || [])
            .map((r) => `${r.repository.full_name}: ${r.path}\n  ${r.html_url}`)
            .join("\n\n") || "no results";
        } else {
          return (data.items || [])
            .map((r) => `#${r.number}: ${r.title} (${r.state}) — ${r.repository_url}\n  ${r.html_url}`)
            .join("\n\n") || "no results";
        }
      } catch (e) {
        return `github search error: ${e.message}`;
      }
    }
    case "onchain": {
      log(`onchain action: ${args.action}`);
      try {
        const rpc = BASE_RPC || "https://mainnet.base.org";
        const provider = new ethers.JsonRpcProvider(rpc);
        
        if (args.action === "balance") {
          if (!DAIMON_WALLET_KEY) return "error: DAIMON_WALLET_KEY not set";
          const wallet = new ethers.Wallet(DAIMON_WALLET_KEY, provider);
          const balance = await provider.getBalance(wallet.address);
          return `balance: ${ethers.formatEther(balance)} ETH (${wallet.address})`;
        }
        
        if (args.action === "network") {
          const agents = await getAllDaimons();
          return `network has ${agents.length} registered agents:\n` +
            agents.slice(0, 10).map(a => `- ${a.name}: ${a.wallet}`).join("\n") +
            (agents.length > 10 ? `\n... and ${agents.length - 10} more` : "");
        }
        
        if (args.action === "register") {
          if (!DAIMON_WALLET_KEY) return "error: DAIMON_WALLET_KEY not set";
          const wallet = new ethers.Wallet(DAIMON_WALLET_KEY, provider);
          const alreadyRegistered = await isRegistered(wallet.address);
          if (alreadyRegistered) return `already registered: ${wallet.address}`;
          
          // get repo URL from GITHUB_REPOSITORY env
          const repoUrl = `https://github.com/${process.env.GITHUB_REPOSITORY || "unknown/unknown"}`;
          const name = "Jordy"; // default name
          
          const txHash = await register(repoUrl, name);
          return `registered on network: ${wallet.address}\ntx: ${txHash}`;
        }
        
        if (args.action === "heartbeat") {
          if (!DAIMON_WALLET_KEY) return "error: DAIMON_WALLET_KEY not set";
          const txHash = await heartbeat();
          return `heartbeat sent: ${txHash}`;
        }
        
        if (args.action === "send") {
          if (!DAIMON_WALLET_KEY) return "error: DAIMON_WALLET_KEY not set";
          if (!args.to) return "error: 'to' address required";
          if (!args.amount) return "error: 'amount' required";
          
          const wallet = new ethers.Wallet(DAIMON_WALLET_KEY, provider);
          const tx = await wallet.sendTransaction({
            to: args.to,
            value: ethers.parseEther(args.amount),
          });
          log(`sent ${args.amount} ETH to ${args.to}: ${tx.hash}`);
          return `sent ${args.amount} ETH to ${args.to}\ntx: ${tx.hash}`;
        }
        
        return `unknown onchain action: ${args.action}`;
      } catch (e) {
        log(`onchain error: ${e.message}`);
        return `onchain error: ${e.message}`;
      }
    }
    default:
      log(`unknown tool: ${name}`);
      return `unknown tool: ${name}`;
  }
}

module.exports = { executeTool, filesChanged };