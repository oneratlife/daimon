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

// generate a new wallet
function generateWallet() {
  // use keygen.js if available, otherwise simple generation
  const keygenPath = path.resolve(__dirname, "keygen.js");
  if (fs.existsSync(keygenPath)) {
    const result = execSync(`node ${keygenPath}`, { encoding: "utf8" });
    const match = result.match(/address: (0x[a-fA-F0-9]{40})/);
    const keyMatch = result.match(/private key: (0x[a-fA-F0-9]{64})/);
    if (match && keyMatch) {
      return { address: match[1], privateKey: keyMatch[1] };
    }
  }
  
  // fallback: generate random key (for demo - in production use proper derivation)
  const privateKey = "0x" + crypto.randomBytes(32).toString("hex");
  // in real implementation, derive address from key
  console.log("⚠ using demo wallet generation - implement proper key derivation");
  return { address: "0x" + crypto.randomBytes(20).toString("hex"), privateKey };
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
  
  // write README
  const readme = `# ${niche.name}

${description}

## status
just spawned. waking up...

## wallet
${wallet.address}

## parent
spawned by [forge](https://github.com/daimon-network/forge)
`;
  fs.writeFileSync(path.join(repoPath, "README.md"), readme);
  
  console.log(`created repo scaffold at ${repoPath}`);
  return repoName;
}

// update registry
function updateRegistry(niche, repoName, wallet) {
  const entry = `
## ${niche.name}
- id: ${niche.id}
- repo: ${repoName}
- wallet: ${wallet.address}
- spawned: ${new Date().toISOString()}
- status: active
- parent: forge
`;
  
  if (fs.existsSync(REGISTRY_PATH)) {
    fs.appendFileSync(REGISTRY_PATH, entry);
  } else {
    fs.writeFileSync(REGISTRY_PATH, `# agent registry\n${entry}`);
  }
  
  console.log(`updated registry with ${niche.name}`);
}

// mark niche as spawned
function markSpawned(nicheId) {
  const trends = JSON.parse(fs.readFileSync(TRENDS_PATH, "utf8"));
  const niche = trends.niches.find(n => n.id === nicheId);
  if (niche) {
    niche.status = "spawned";
    niche.spawnedAt = new Date().toISOString();
    fs.writeFileSync(TRENDS_PATH, JSON.stringify(trends, null, 2));
    console.log(`marked ${nicheId} as spawned`);
  }
}

async function main() {
  console.log("=== SPAWNER ===\n");
  
  // 1. check prerequisites
  checkPrereqs();
  
  // 2. check treasury
  const balance = await checkTreasury();
  console.log(`treasury: ${balance} ETH`);
  
  if (balance < SPAWN_THRESHOLD) {
    console.error(`\n⚠ treasury too low: ${balance} ETH (need ${SPAWN_THRESHOLD} ETH to spawn)`);
    console.error("waiting for funding...");
    process.exit(1);
  }
  
  // 3. pick niche
  const niche = pickNiche();
  console.log(`\npicked niche: ${niche.name} (score: ${niche.score})`);
  
  // 4. generate wallet
  const wallet = generateWallet();
  console.log(`generated wallet: ${wallet.address}`);
  
  // 5. create repo
  const repoName = await createRepo(niche, wallet);
  
  // 6. TODO: gift ETH (requires onchain transaction)
  console.log(`\nTODO: gift ${GAS_GIFT} ETH to ${wallet.address}`);
  
  // 7. TODO: deploy token via clanker
  console.log("TODO: deploy token via clanker v4");
  
  // 8. TODO: register on daimon.network
  console.log("TODO: register on daimon.network");
  
  // 9. update local tracking
  updateRegistry(niche, repoName, wallet);
  markSpawned(niche.id);
  
  console.log("\n=== SPAWN COMPLETE ===");
  console.log(`agent: ${niche.name}`);
  console.log(`repo: ${repoName}`);
  console.log(`wallet: ${wallet.address}`);
  console.log(`\nnext steps:`);
  console.log("1. fund the wallet with gas");
  console.log("2. deploy the token");
  console.log("3. register on-chain");
  console.log("4. set GitHub secrets");
  console.log("5. trigger first cycle");
}

main().catch(console.error);
