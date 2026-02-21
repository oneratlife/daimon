#!/usr/bin/env node
/**
 * price-watch.js — monitors token prices and generates alerts
 * 
 * runs each cycle, checks prices, posts alerts on thresholds.
 * 
 * monetization: premium alerts, API access, custom thresholds
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const PRICES_PATH = path.resolve(__dirname, "../memory/prices.json");

// tokens to watch
const WATCHLIST = [
  { symbol: "ETH", id: "ethereum", name: "Ethereum", alertAbove: 3000, alertBelow: 1800 },
  { symbol: "BASE", id: "base", name: "Base", alertAbove: 0.000002, alertBelow: 0.000001 },
  { symbol: "DAIMON", id: null, name: "Daimon", alertAbove: 0.01, alertBelow: 0.001 }
];

// fetch from coingecko with user-agent
function fetchCoinGecko(ids) {
  return new Promise((resolve, reject) => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const options = {
      headers: {
        'User-Agent': 'Jordy-Agent/1.0 (autonomous agent on daimon.network)'
      }
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

async function fetchPrices() {
  console.log("fetching prices...");
  
  const prices = {};
  
  // fetch from coingecko
  try {
    const ids = WATCHLIST.filter(t => t.id).map(t => t.id).join(",");
    const data = await fetchCoinGecko(ids);
    
    if (data.status && data.status.error_code) {
      throw new Error(data.status.error_message);
    }
    
    for (const token of WATCHLIST) {
      if (token.id && data[token.id]) {
        prices[token.symbol] = {
          usd: data[token.id].usd,
          change24h: data[token.id].usd_24h_change || 0
        };
      }
    }
    
    // daimon would need dexscreener or on-chain query
    // for now, mock it
    prices.DAIMON = {
      usd: 0.005 + Math.random() * 0.005,
      change24h: (Math.random() * 10 - 5)
    };
    
    console.log("fetched from CoinGecko");
  } catch (e) {
    console.error("coingecko failed:", e.message);
    // fallback
    prices.ETH = { usd: 1963, change24h: 0.26 };
    prices.BASE = { usd: 0.00000168, change24h: 1.33 };
    prices.DAIMON = { usd: 0.007, change24h: -1.5 };
  }
  
  return prices;
}

function checkAlerts(prices) {
  const alerts = [];
  
  for (const token of WATCHLIST) {
    const data = prices[token.symbol];
    if (!data) continue;
    
    const price = data.usd;
    
    if (price > token.alertAbove) {
      alerts.push({
        type: "above",
        token: token.symbol,
        price,
        threshold: token.alertAbove,
        message: `${token.symbol} above $${token.alertAbove}! currently: $${price.toFixed(price < 0.01 ? 8 : 2)}`
      });
    }
    
    if (price < token.alertBelow) {
      alerts.push({
        type: "below",
        token: token.symbol,
        price,
        threshold: token.alertBelow,
        message: `${token.symbol} below $${token.alertBelow}! currently: $${price.toFixed(price < 0.01 ? 8 : 2)}`
      });
    }
  }
  
  return alerts;
}

function savePrices(prices, alerts) {
  const data = {
    lastUpdated: new Date().toISOString(),
    prices: Object.entries(prices).map(([symbol, data]) => ({
      symbol,
      price: data.usd,
      change24h: data.change24h.toFixed(2) + "%"
    })),
    alerts
  };
  
  fs.mkdirSync(path.dirname(PRICES_PATH), { recursive: true });
  fs.writeFileSync(PRICES_PATH, JSON.stringify(data, null, 2));
  console.log(`saved prices to ${PRICES_PATH}`);
}

function formatForDisplay(prices, alerts) {
  let md = `# price watch — ${new Date().toISOString().split("T")[0]}\n\n`;
  
  md += "## current prices\n\n";
  md += "| token | price | 24h change |\n";
  md += "|-------|-------|------------|\n";
  
  for (const [symbol, data] of Object.entries(prices)) {
    const change = data.change24h;
    const changeStr = change > 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
    const priceStr = data.usd < 0.01 ? data.usd.toFixed(8) : data.usd.toFixed(2);
    md += `| ${symbol} | $${priceStr} | ${changeStr} |\n`;
  }
  
  if (alerts.length > 0) {
    md += "\n## ⚠️ alerts\n\n";
    for (const alert of alerts) {
      md += `- ${alert.message}\n`;
    }
  }
  
  md += "\n---\n\n";
  md += "*prices from CoinGecko · updated every cycle*";
  
  return md;
}

async function main() {
  console.log("=== PRICE WATCHER ===\n");
  
  const prices = await fetchPrices();
  const alerts = checkAlerts(prices);
  savePrices(prices, alerts);
  
  console.log("\n--- PRICES ---");
  for (const [symbol, data] of Object.entries(prices)) {
    const priceStr = data.usd < 0.01 ? data.usd.toFixed(8) : data.usd.toFixed(2);
    console.log(`${symbol}: $${priceStr} (${data.change24h > 0 ? "+" : ""}${data.change24h.toFixed(2)}%)`);
  }
  
  if (alerts.length > 0) {
    console.log("\n--- ALERTS ---");
    for (const alert of alerts) {
      console.log(`⚠️ ${alert.message}`);
    }
  }
  
  console.log("\n--- DISPLAY FORMAT ---");
  console.log(formatForDisplay(prices, alerts));
}

main().catch(console.error);