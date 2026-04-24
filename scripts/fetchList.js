#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import crypto from 'crypto';

const DATA_DIR = path.join('.', 'data', 'staff-data');
const INPUT_CSV = path.join(DATA_DIR, 'ProfileID-CASA.csv');
const OUTPUT_DIR = path.join('data', 'staff', 'profiles');
const STATS_DIR = path.join('data', 'staff', 'stats');
const API_BASE_URL = 'http://localhost:3000';

let skipped = 0;
let processed = 0;
let unchanged = 0;

// Report Accumulators
let reportText = '';
let reportMd = '';

const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

function addToReport(message) {
  console.log(message);
  const cleanMsg = stripAnsi(message);
  reportText += cleanMsg + '\n';
  // Convert headers to MD headers if they look like titles
  if (message.includes('\x1b[')) {
    reportMd += `### ${cleanMsg}\n\n`;
  } else {
    reportMd += cleanMsg + '\n\n';
  }
}

function addTableToReport(data) {
  if (!data || data.length === 0) return;
  
  console.table(data);

  const keys = Object.keys(data[0]);
  const widths = keys.map(k => Math.max(k.length, ...data.map(row => String(row[k] ?? '').length)));

  // Text Table
  const textHeader = keys.map((k, i) => k.padEnd(widths[i])).join(' | ');
  const textDivider = widths.map(w => '-'.repeat(w)).join('-+-');
  const textRows = data.map(row => keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i])).join(' | '));
  reportText += [textHeader, textDivider, ...textRows, ''].join('\n') + '\n';

  // Markdown Table
  const mdHeader = `| ${keys.join(' | ')} |`;
  const mdDivider = `| ${keys.map(() => '---').join(' | ')} |`;
  const mdRows = data.map(row => `| ${keys.map(k => row[k] ?? '').join(' | ')} |`);
  reportMd += [mdHeader, mdDivider, ...mdRows, ''].join('\n') + '\n';
}

// Ensure output directory exists
async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(STATS_DIR, { recursive: true });
  } catch (error) {
    console.error('\x1b[31m❌ Could not create output directory.\x1b[0m', error);
    process.exit(1);
  }
}

async function fetchAndSaveProfiles() {
  await ensureOutputDir();

  const csvContent = await fs.readFile(INPUT_CSV, 'utf-8');
  const records = csvParse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  for (const record of records) {
    const profileId = record['Profiles ID'];
    if (!profileId) {
      //console.warn('\x1b[33m⚠️  Skipping record with missing Profile ID:\x1b[0m', record);
      skipped++;
      continue;
    }

    console.log(`\x1b[36m🔍 Fetching data for Profile ID: ${profileId}...\x1b[0m`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile/${profileId}`);
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      const profileData = await response.json();
      const newData = JSON.stringify(profileData, null, 2);
      const outputFilePath = path.join(OUTPUT_DIR, `${profileId}.json`);

      try {
        const existingData = await fs.readFile(outputFilePath, 'utf-8');
        const oldHash = crypto.createHash('sha256').update(existingData).digest('hex');
        const newHash = crypto.createHash('sha256').update(newData).digest('hex');

        if (oldHash === newHash) {
          console.log(`\x1b[33m⏭️  Profile ${profileId} is unchanged. Skipping.\x1b[0m`);
          unchanged++;
          continue;
        }

        console.log(`\x1b[35m🔄 Profile ${profileId} has changed. Updating...\x1b[0m`);
        await fs.unlink(outputFilePath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      await fs.writeFile(outputFilePath, newData, 'utf-8');
      console.log(`\x1b[32m✅ Saved profile data to ${outputFilePath}\x1b[0m`);
      processed++;
    } catch (error) {
      console.error(`\x1b[31m💥 Failed to fetch or save profile for ID ${profileId}:\x1b[0m`, error.message);
    }
  }
}

async function compileStats() {
  addToReport('\n\x1b[35m📊 Compiling Statistics from Local Data...\x1b[0m');
  
  const files = (await fs.readdir(OUTPUT_DIR)).filter(f => f.endsWith('.json'));
  const profileStats = [];
  const typeYearCounts = {};
  const yearCounts = {};
  let totalPublications = 0;
  const allYears = new Set();

  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const profileId = file.replace('.json', '');
    const name = data.profile?.name || profileId;
    const pubs = data.publications || [];

    profileStats.push({
      'Profile ID': profileId,
      'Staff Name': name,
      'Pub Count': pubs.length
    });

    pubs.forEach(pub => {
      const type = pub.objectTypeDisplayName || 'Unknown Type';
      const year = pub.publicationDate?.year || 'Unknown Year';
      allYears.add(year);

      if (!typeYearCounts[type]) typeYearCounts[type] = {};
      typeYearCounts[type][year] = (typeYearCounts[type][year] || 0) + 1;

      yearCounts[year] = (yearCounts[year] || 0) + 1;
      totalPublications++;
    });
  }

  // Output individual profile counts
  addToReport('\n\x1b[36m👤 Publications per Profile:\x1b[0m');
  addTableToReport(profileStats.sort((a, b) => b['Pub Count'] - a['Pub Count']));

  // Prepare years for columns (sorted descending)
  const sortedYears = Array.from(allYears).sort((a, b) => {
    if (a === 'Unknown Year') return 1;
    if (b === 'Unknown Year') return -1;
    return b - a;
  });

  addToReport('\n\x1b[36m📚 Publication Types by Year:\x1b[0m\n');
  sortedYears.forEach(year => {
    const yearData = Object.keys(typeYearCounts)
      .filter(type => typeYearCounts[type][year] > 0)
      .map(type => ({
        'Publication Type': type,
        'Count': typeYearCounts[type][year]
      }))
      .sort((a, b) => b.Count - a.Count);
    
    if (yearData.length > 0) {
      addToReport(`\x1b[33m--- 📅 Publications in ${year} ---\x1b[0m`);
      addTableToReport(yearData);
    }
  });

  // Prepare All Publications by Year table
  const yearBreakdown = sortedYears.map(year => ({
    'Year': year,
    'Count': yearCounts[year]
  }));

  addToReport('\n\x1b[36m📅 Total Publications by Year:\x1b[0m');
  addTableToReport(yearBreakdown);

  addToReport(`\n\x1b[32m📈 Grand Total Publications: ${totalPublications}\x1b[0m`);
  addToReport(`\x1b[32m📂 Total Profiles Analyzed: ${files.length}\x1b[0m`);
}

async function compileProfileYearlyStats() {
  addToReport('\n\x1b[35m👥 Compiling Publications per Profile per Year...\x1b[0m\n');

  const files = (await fs.readdir(OUTPUT_DIR)).filter(f => f.endsWith('.json'));
  const yearProfileCounts = {}; // { year: { name: count } }
  const allYears = new Set();

  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const profileId = file.replace('.json', '');
    const name = data.profile?.name || profileId;
    const pubs = data.publications || [];

    pubs.forEach(pub => {
      const year = pub.publicationDate?.year || 'Unknown Year';
      allYears.add(year);
      if (!yearProfileCounts[year]) yearProfileCounts[year] = {};
      yearProfileCounts[year][name] = (yearProfileCounts[year][name] || 0) + 1;
    });
  }

  const sortedYears = Array.from(allYears).sort((a, b) => {
    if (a === 'Unknown Year') return 1;
    if (b === 'Unknown Year') return -1;
    return b - a;
  });

  sortedYears.forEach(year => {
    const yearData = Object.entries(yearProfileCounts[year])
      .map(([name, count]) => ({
        'Staff Name': name,
        'Pubs': count
      }))
      .sort((a, b) => b.Pubs - a.Pubs);

    if (yearData.length > 0) {
      addToReport(`\x1b[36m📅 Publications in ${year}:\x1b[0m\n`);
      addTableToReport(yearData);
    }
  });
}

async function main() {
  const now = new Date().toLocaleString();
  const headerText = `
================================================================================
📊 UCL CASA STAFF PROFILE STATISTICS REPORT
================================================================================
Generated on: ${now}
Script:       fetchList.js
Description:  Automated tool for fetching UCL staff profile data and generating 
              comprehensive publication analytics.
Data Source:  Local API (${API_BASE_URL}) & UCL Profiles API
Output:       Individual JSON profiles and compiled statistical summaries.
================================================================================
`;

  reportText = headerText;
  reportMd = `# 📊 UCL Staff Profile Statistics Report\n\n` +
             `**Generated on:** ${now}\n\n` +
             `**Script:** \`fetchList.js\`\n\n` +
             `**Description:** Automated tool for fetching UCL staff profile data and generating comprehensive publication analytics.\n\n` +
             `**Data Source:** Local API (\`${API_BASE_URL}\`) & UCL Profiles API\n\n` +
             `**Output:** Individual JSON profiles and compiled statistical summaries.\n\n` +
             `---\n\n`;

  await fetchAndSaveProfiles();
  addToReport('\n\x1b[34m🏁 Finished processing.\x1b[0m');
  addToReport(`\x1b[32m✨ Processed ${processed + unchanged} records (${processed} updated, ${unchanged} unchanged).\x1b[0m`);
  addToReport(`\x1b[33m⏭️  Skipped ${skipped} records due to missing ID.\x1b[0m`);

  await compileStats();
  await compileProfileYearlyStats();

  const textPath = path.join(STATS_DIR, 'report.txt');
  const mdPath = path.join(STATS_DIR, 'report.md');
  await fs.writeFile(textPath, reportText, 'utf-8');
  await fs.writeFile(mdPath, reportMd, 'utf-8');
  console.log(`\n\x1b[32m💾 Reports saved to ${textPath} and ${mdPath}\x1b[0m`);
}

main();