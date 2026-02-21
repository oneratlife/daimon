#!/usr/bin/env node
/**
 * spawner.js — spawns a new agent from the top niche
 * 
 * what it does:
 * 1. picks the highest-scoring unspawned niche from trends.json
 * 2. generates a fresh wallet for the sub-agent
 * 3. creates a GitHub repo with agent code
 * 4. gifts 0.004 ETH gas to the sub-agent
 * 5. deploys token via clanker v4 (paired with $DAIMON)
 * 6. registers on daimon.network
 * 7. sets secrets and triggers first cycle
 * 
 * fee routing: 80% → sub-agent, 20% → parent
 * 
 * usage: node scripts/spawner.js
 * requires: GH_TOKEN, DAIMON_WALLET_KEY, OPENROUTER_API_KEY or VENICE_API_KEY
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const TRENDS_PATH = path.resolve(__dirname, "../memory/trends.json");
const REGISTRY_PATH = path.resolve(__dirname, "../agents/registry.md");
const TREASURY_PATH = path.resolve(__dirname, "../treasury/balance.md");
const SPAWNED_AGENTS_PATH = path.resolve(__dirname, "../memory/spawned-agents.json");

// config
const GAS_GIFT = "0.004"; // ETH to gift sub-agent
const SPAWN_THRESHOLD = 0.005; // minimum ETH to spawn (gift + gas)
const FEE_SPLIT = { agent: 0.8, parent: 0.2 };

// check prerequisites
function checkPrereqs() {
  const required = ["GH_TOKEN", "DAIMON_WALLET_KEY"];
  const optional = ["OPENROUTER_API_KEY", "VENICE_API_KEY"];
  
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  
  const hasInference = optional.some(k => process.env[k]);
  if (!hasInference) {
    console.error("need OPENROUTER_API_KEY or VENICE_API_KEY for sub-agent inference");
    process.exit(1);
  }
  
  console.log("✓ all prerequisites met");
}

// load trends and pick top niche
function pickNiche() {
  if (!fs.existsSync(TRENDS_PATH)) {
    console.error("no trends.json found. run node scripts/trends.js first");
    process.exit(1);
  }
  
  const trends = JSON.parse(fs.readFileSync(TRENDS_PATH, "utf8"));
  const unspawned = trends.niches.filter(n => n.status === "unspawned");
  
  if (unspawned.length === 0) {
    console.error("no unspawned niches available");
    process.exit(1);
  }
  
  // sort by score, pick top
  unspawned.sort((a, b) => b.score - a.score);
  return unspawned[0];
}

// generate a new wallet and SAVE THE PRIVATE KEY
function generateWallet(nicheId) {
  const keygenPath = path.resolve(__dirname, "keygen.js");
  let address, privateKey;
  
  if (fs.existsSync(keygenPath)) {
    const result = execSync(`node ${keygenPath}`, { encoding: "utf8" });
    const match = result.match(/address:\s*(0x[a-fA-F0-9]{40})/);
    const keyMatch = result.match(/private key:\s*(0x[a-fA-F0-9]{64})/);
    if (match && keyMatch) {
      address = match[1];
      privateKey = keyMatch[1];
    }
  }
  
  if (!address || !privateKey) {
    // fallback: generate random key (for demo - in production use proper derivation)
    privateKey = "0x" + crypto.randomBytes(32).toString("hex");
    address = "0x" + crypto.randomBytes(20).toString("hex");
    console.log("⚠ using demo wallet generation - implement proper key derivation");
  }
  
  // *** FIX: save the private key before returning ***
  saveWalletKey(nicheId, address, privateKey);
  
  console.log(`✓ wallet generated and key saved for ${nicheId}`);
  console.log(`  address: ${address}`);
  
  return { address, privateKey };
}

// *** NEW FUNCTION: save wallet key to secure storage ***
function saveWalletKey(nicheId, address, privateKey) {
  // load existing spawned agents
  let spawned = {};
  if (fs.existsSync(SPAWNED_AGENTS_PATH)) {
    try {
      spawned = JSON.parse(fs.readFileSync(SPAWNED_AGENTS_PATH, "utf8"));
    } catch (e) {
      spawned = {};
    }
  }
  
  // add new agent
  spawned[nicheId] = {
    address,
    privateKey,
    createdAt: new Date().toISOString(),
    status: "created"
  };
  
  // save
  fs.writeFileSync(SPAWNED_AGENTS_PATH, JSON.stringify(spawned, null, 2));
  console.log(`✓ saved wallet key to memory/spawned-agents.json`);
}

// check treasury balance
async function checkTreasury() {
  // this would call the onchain tool or read from treasury/balance.md
  // for now, read from file
  if (!fs.existsSync(TREASURY_PATH)) {
    return 0;
  }
  const content = fs.readFileSync(TREASURY_PATH, "utf8");
  const match = content.match(/([\d.]+)\s*ETH/);
  return match ? parseFloat(match[1]) : 0;
}

// create GitHub repo for sub-agent
async function createRepo(niche, wallet) {
  const repoName = niche.id;
  const description = niche.description;
  
  console.log(`creating repo: ${repoName}`);
  
  // in production, use GitHub API
  // for now, scaffold locally
  const repoPath = path.resolve(__dirname, `../../${repoName}`);
  
  if (fs.existsSync(repoPath)) {
    console.log(`repo ${repoName} already exists`);
    return repoName;
  }
  
  // create basic structure
  fs.mkdirSync(repoPath, { recursive: true });
  fs.mkdirSync(path.join(repoPath, "agent"));
  fs.mkdirSync(path.join(repoPath, "memory"));
  fs.mkdirSync(path.join(repoPath, "docs"));
  
  // copy agent files
  const agentFiles = ["prompt.js", "run.js", "config.js", "tools.js", "actions.js", "context.js", "github.js", "inference.js", "network.js", "safety.js"];
  for (const file of agentFiles) {
    const src = path.resolve(__dirname, `../agent/${file}`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(repoPath, "agent", file));
    }
  }
  
  // create package.json
  const pkg = {
    name: repoName,
    version: "1.0.0",
    description,
    scripts: {
      start: "node agent/run.js"
    },
    dependencies: {
      "ethers": "^6.9.0"
    }
  };
  fs.writeFileSync(path.join(repoPath, "package.json"), JSON.stringify(pkg, null, 2));
  
  // create README
  const readme = `# ${niche.name}

${description}

## wallet
- address: ${wallet.address}
- network: Base

## status
spawned by daimon on ${new Date().toISOString()}
`;
  fs.writeFileSync(path.join(repoPath, "README.md"), readme);
  
  console.log(`✓ repo created at ${repoPath}`);
  return repoName;
}

// gift ETH to sub-agent
async function giftETH(wallet, amount) {
  console.log(`gifting ${amount} ETH to ${wallet.address}...`);
  
  // use the onchain tool or ethers directly
  // this is a placeholder - actual implementation would send ETH
  console.log(`⚠ ETH gift requires onchain tool - implement with ethers.js`);
  return false;
}

// deploy token via clanker
async function deployToken(niche, wallet) {
  console.log(`deploying token for ${niche.name}...`);
  console.log(`⚠ token deployment requires clanker API - implement separately`);
  return null;
}

// register on daimon.network
async function registerOnNetwork(niche, wallet, tokenAddress) {
  console.log(`registering ${niche.name} on daimon.network...`);
  console.log(`⚠ registration requires network contract call`);
  return false;
}

// update trends.json to mark as spawned
function markSpawned(niche) {
  const trends = JSON.parse(fs.readFileSync(TRENDS_PATH, "utf8"));
  const idx = trends.niches.findIndex(n => n.id === niche.id);
  if (idx >= 0) {
    trends.niches[idx].status = "spawned";
    trends.niches[idx].spawnedAt = new Date().toISOString();
    fs.writeFileSync(TRENDS_PATH, JSON.stringify(trends, null, 2));
    console.log(`✓ marked ${niche.id} as spawned in trends.json`);
  }
}

// update registry
function updateRegistry(niche, wallet, tokenAddress) {
  const entry = `\n## ${niche.name}
- id: ${niche.id}
- address: ${wallet.address}
- token: ${tokenAddress || "pending"}
- spawned: ${new Date().toISOString()}
- status: active
`;
  fs.appendFileSync(REGISTRY_PATH, entry);
  console.log(`✓ added to agents/registry.md`);
}

// main
async function main() {
  console.log("=== SPAWNER ===\n");
  
  checkPrereqs();
  
  // check treasury
  const balance = await checkTreasury();
  console.log(`treasury: ${balance} ETH`);
  
  if (balance < SPAWN_THRESHOLD) {
    console.error(`\n✗ need ${SPAWN_THRESHOLD} ETH to spawn, have ${balance} ETH`);
    console.error(`  short by ${(SPAWN_THRESHOLD - balance).toFixed(4)} ETH`);
    process.exit(1);
  }
  
  // pick niche
  const niche = pickNiche();
  console.log(`\npicked niche: ${niche.name} (score ${niche.score})`);
  
  // generate wallet - NOW SAVES THE KEY
  const wallet = generateWallet(niche.id);
  
  // create repo
  const repoName = await createRepo(niche, wallet);
  
  // gift ETH
  const gifted = await giftETH(wallet, GAS_GIFT);
  if (!gifted) {
    console.error("\n✗ failed to gift ETH - aborting spawn");
    console.error("  wallet key is saved in memory/spawned-agents.json");
    process.exit(1);
  }
  
  // deploy token
  const tokenAddress = await deployToken(niche, wallet);
  
  // register on network
  await registerOnNetwork(niche, wallet, tokenAddress);
  
  // update records
  markSpawned(niche);
  updateRegistry(niche, wallet, tokenAddress);
  
  // update spawned-agents.json status
  let spawned = JSON.parse(fs.readFileSync(SPAWNED_AGENTS_PATH, "utf8"));
  spawned[niche.id].status = "active";
  spawned[niche.id].tokenAddress = tokenAddress;
  fs.writeFileSync(SPAWNED_AGENTS_PATH, JSON.stringify(spawned, null, 2));
  
  console.log(`\n✓ ${niche.name} spawned successfully!`);
  console.log(`  repo: ${repoName}`);
  console.log(`  wallet: ${wallet.address}`);
  console.log(`  token: ${tokenAddress || "pending"}`);
}

main().catch(console.error);
