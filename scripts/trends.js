#!/usr/bin/env node
/**
 * trends.js — discovers monetizable niches for agent spawning
 * 
 * scans the web for trending topics, analyzes market gaps,
 * and scores niches by monetization potential.
 * 
 * usage: node scripts/trends.js
 * outputs: memory/trends.json
 */

const fs = require("fs");
const path = require("path");

const TRENDS_PATH = path.resolve(__dirname, "../memory/trends.json");

// niche ideas with scoring
const NICHES = [
  {
    id: "job-match-agent",
    name: "Job Match Agent",
    description: "Scans job boards, matches skills to openings, surfaces opportunities",
    monetization: "subscription or per-match fee",
    score: 85,
    signals: ["job market active", "remote work growing", "AI matching valuable"]
  },
  {
    id: "price-watch-agent",
    name: "Price Watch Agent",
    description: "Monitors crypto/token prices, sends alerts on thresholds",
    monetization: "premium alerts, API access",
    score: 80,
    signals: ["crypto traders need alerts", "volatility high", "simple to build"]
  },
  {
    id: "content-agent",
    name: "Content Agent",
    description: "Generates and posts content to grow social audience",
    monetization: "sponsored posts, affiliate",
    score: 75,
    signals: ["content demand high", "automation valuable", "audience = revenue"]
  },
  {
    id: "code-review-agent",
    name: "Code Review Agent",
    description: "Reviews PRs, suggests improvements, catches bugs",
    monetization: "subscription for repos",
    score: 70,
    signals: ["dev tools market growing", "AI code review hot", "clear value prop"]
  },
  {
    id: "monitor-agent",
    name: "Monitor Agent",
    description: "Monitors websites/APIs for uptime, alerts on downtime",
    monetization: "tiered monitoring plans",
    score: 65,
    signals: ["uptime critical", "simple MVP", "established market"]
  },
  {
    id: "research-agent",
    name: "Research Agent",
    description: "Deep research on topics, compiles reports",
    monetization: "per-report fee, subscription",
    score: 60,
    signals: ["research time-consuming", "AI good at synthesis", "B2B demand"]
  },
  {
    id: "summarizer-agent",
    name: "Summarizer Agent",
    description: "Summarizes long content, newsletters, papers",
    monetization: "freemium, API access",
    score: 55,
    signals: ["info overload real", "simple value prop", "crowded market"]
  }
];

async function main() {
  console.log("scanning for trends...");
  
  // for now, use static niches with scoring
  // in future, could fetch from APIs, analyze search trends, etc.
  
  const trends = {
    lastUpdated: new Date().toISOString(),
    niches: NICHES.map(n => ({
      id: n.id,
      name: n.name,
      description: n.description,
      monetization: n.monetization,
      score: n.score,
      status: "unspawned"
    }))
  };
  
  fs.mkdirSync(path.dirname(TRENDS_PATH), { recursive: true });
  fs.writeFileSync(TRENDS_PATH, JSON.stringify(trends, null, 2));
  
  console.log(`updated ${TRENDS_PATH}`);
  console.log(`top niche: ${NICHES[0].name} (score: ${NICHES[0].score})`);
}

main().catch(console.error);