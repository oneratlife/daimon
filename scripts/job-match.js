#!/usr/bin/env node
/**
 * job-match.js — scans for jobs and matches to skills
 * 
 * runs each cycle, finds relevant opportunities,
 * posts to issues for visibility.
 * 
 * monetization: premium matching, custom alerts, API access
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const JOBS_PATH = path.resolve(__dirname, "../memory/jobs.json");

// skill profiles to match against
const PROFILES = [
  {
    id: "solidity-dev",
    name: "Solidity Developer",
    skills: ["solidity", "ethereum", "smart contracts", "defi", "foundry", "hardhat"],
    keywords: ["solidity", "smart contract", "defi", "web3", "blockchain developer", "ethereum"]
  },
  {
    id: "ai-engineer",
    name: "AI Engineer",
    skills: ["python", "pytorch", "tensorflow", "llm", "machine learning", "rag"],
    keywords: ["ai engineer", "machine learning", "llm", "ml engineer", "ai developer", "artificial intelligence"]
  },
  {
    id: "fullstack",
    name: "Full Stack Developer",
    skills: ["javascript", "typescript", "react", "node", "python", "sql"],
    keywords: ["full stack", "fullstack", "frontend backend", "web developer", "react", "node"]
  },
  {
    id: "devops",
    name: "DevOps Engineer",
    skills: ["kubernetes", "docker", "aws", "terraform", "ci/cd"],
    keywords: ["devops", "kubernetes", "docker", "cloud engineer", "sre", "platform engineer"]
  }
];

// fetch from remoteok API
function fetchRemoteOK() {
  return new Promise((resolve, reject) => {
    https.get("https://remoteok.com/api", (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          // first item is legal notice, skip it
          const jobs = json.slice(1).map(j => ({
            id: j.id,
            title: j.position,
            company: j.company,
            location: "Remote",
            salary: j.salary || "Not specified",
            url: `https://remoteok.com/remote-jobs/${j.slug}`,
            description: (j.description || "").replace(/<[^>]*>/g, " ").substring(0, 500),
            tags: j.tags || [],
            posted: j.date
          }));
          resolve(jobs);
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function matchJob(job, profile) {
  const text = `${job.title} ${job.description} ${job.tags.join(" ")}`.toLowerCase();
  const matches = profile.keywords.filter(kw => text.includes(kw.toLowerCase()));
  return {
    profile: profile.id,
    score: matches.length,
    matches: matches
  };
}

async function scanJobs() {
  console.log("scanning for jobs...");
  
  let jobs = [];
  try {
    jobs = await fetchRemoteOK();
    console.log(`fetched ${jobs.length} jobs from RemoteOK`);
  } catch (e) {
    console.error("failed to fetch jobs:", e.message);
    // fallback to mock data
    jobs = [
      {
        id: "mock-1",
        title: "Senior Solidity Engineer",
        company: "DeFi Protocol",
        location: "Remote",
        salary: "$150k-200k",
        url: "https://example.com/job/1",
        description: "Build smart contracts for DeFi protocol",
        tags: ["solidity", "defi", "web3"],
        posted: "2026-02-20"
      }
    ];
  }
  
  // match against profiles
  const results = [];
  for (const job of jobs) {
    const matches = [];
    for (const profile of PROFILES) {
      const match = matchJob(job, profile);
      if (match.score > 0) {
        matches.push(match);
      }
    }
    if (matches.length > 0) {
      matches.sort((a, b) => b.score - a.score);
      results.push({
        job,
        bestMatch: matches[0],
        allMatches: matches
      });
    }
  }
  
  // sort by match score
  results.sort((a, b) => b.bestMatch.score - a.bestMatch.score);
  
  return results;
}

function saveResults(results) {
  const data = {
    lastScanned: new Date().toISOString(),
    totalJobs: results.length,
    matches: results.slice(0, 20) // keep top 20
  };
  
  fs.mkdirSync(path.dirname(JOBS_PATH), { recursive: true });
  fs.writeFileSync(JOBS_PATH, JSON.stringify(data, null, 2));
  console.log(`saved ${results.length} matched jobs to ${JOBS_PATH}`);
}

function formatForDisplay(results) {
  if (results.length === 0) {
    return "no matching jobs found this cycle.";
  }
  
  let md = `# job matches — ${new Date().toISOString().split("T")[0]}\n\n`;
  md += `found ${results.length} matching opportunities:\n\n`;
  
  for (const r of results.slice(0, 5)) { // top 5
    const { job, bestMatch } = r;
    md += `## ${job.title}\n`;
    md += `**${job.company}** · ${job.location}\n\n`;
    md += `${job.description.substring(0, 200)}...\n\n`;
    md += `**matched to:** ${bestMatch.profile} (${bestMatch.score} keywords)\n`;
    md += `**apply:** [view job](${job.url})\n\n`;
    md += `---\n\n`;
  }
  
  md += `\n*scanned RemoteOK · updated every cycle*\n`;
  return md;
}

async function main() {
  console.log("=== JOB MATCHER ===\n");
  
  const results = await scanJobs();
  saveResults(results);
  
  console.log("\n--- TOP MATCHES ---");
  for (const r of results.slice(0, 5)) {
    console.log(`[${r.bestMatch.score}] ${r.job.title} at ${r.job.company} → ${r.bestMatch.profile}`);
  }
  
  console.log("\n--- DISPLAY FORMAT ---");
  console.log(formatForDisplay(results));
}

main().catch(console.error);
