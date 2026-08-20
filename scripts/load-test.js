#!/usr/bin/env node

/**
 * Load Testing Script
 *
 * Simulates concurrent users and measures system performance.
 * Run with: node scripts/load-test.js
 */

const http = require('http');
const os = require('os');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DURATION = parseInt(process.env.DURATION || '60'); // seconds
const USERS = parseInt(process.env.USERS || '50'); // concurrent users
const RPS = parseInt(process.env.RPS || '10'); // requests per second per user

const endpoints = [
  { path: '/health', method: 'GET', weight: 0.1 },
  { path: '/api/communities', method: 'GET', weight: 0.2 },
  { path: '/api/proposals', method: 'GET', weight: 0.3 },
  { path: '/api/proposals/1', method: 'GET', weight: 0.2 },
  { path: '/api/communities/1', method: 'GET', weight: 0.2 },
];

let totalRequests = 0;
let totalErrors = 0;
let totalBytes = 0;
let minLatency = Infinity;
let maxLatency = 0;
let latencySum = 0;

function makeRequest() {
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const start = Date.now();
  
  const request = http.get(`${BASE_URL}${endpoint.path}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const duration = Date.now() - start;
      totalRequests++;
      totalBytes += data.length;
      
      if (duration < minLatency) minLatency = duration;
      if (duration > maxLatency) maxLatency = duration;
      latencySum += duration;
      
      if (res.statusCode >= 400) {
        totalErrors++;
      }
    });
  });
  
  request.on('error', () => {
    totalRequests++;
    totalErrors++;
  });
}

async function runLoadTest() {
  console.log('🚀 AgoraX Load Test');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Duration: ${DURATION}s`);
  console.log(`Users: ${USERS}`);
  console.log(`RPS/User: ${RPS}`);
  console.log('');
  
  const startTime = Date.now();
  const endTime = startTime + (DURATION * 1000);
  
  // Start users
  const userPromises = [];
  for (let i = 0; i < USERS; i++) {
    userPromises.push(startUser(i));
  }
  
  // Monitor progress
  const interval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const rps = totalRequests / elapsed;
    const avgLatency = totalRequests > 0 ? latencySum / totalRequests : 0;
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    
    console.log(`⏱️  ${elapsed.toFixed(1)}s | RPS: ${rps.toFixed(1)} | Avg Latency: ${avgLatency.toFixed(1)}ms | Errors: ${errorRate.toFixed(2)}%`);
  }, 5000);
  
  // Wait for all users to finish
  await Promise.all(userPromises);
  clearInterval(interval);
  
  // Print results
  const totalTime = (Date.now() - startTime) / 1000;
  const rps = totalRequests / totalTime;
  const avgLatency = totalRequests > 0 ? latencySum / totalRequests : 0;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  
  console.log('');
  console.log('📊 Results:');
  console.log(`  Total Requests: ${totalRequests}`);
  console.log(`  RPS: ${rps.toFixed(2)}`);
  console.log(`  Avg Latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`  Min Latency: ${minLatency}ms`);
  console.log(`  Max Latency: ${maxLatency}ms`);
  console.log(`  Error Rate: ${errorRate.toFixed(2)}%`);
  console.log(`  Total Bytes: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Duration: ${totalTime.toFixed(2)}s`);
  console.log('');
  
  // System metrics
  console.log('💻 System:');
  console.log(`  CPU: ${os.cpus().length} cores`);
  console.log(`  Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
}

function startUser(id) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (Date.now() >= endTime) {
        clearInterval(interval);
        resolve();
        return;
      }
      
      for (let i = 0; i < RPS; i++) {
        makeRequest();
      }
    }, 1000);
  });
}

runLoadTest().catch(console.error);
