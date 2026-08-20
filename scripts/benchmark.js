#!/usr/bin/env node

/**
 * Performance Benchmark Script
 *
 * Measures API response times and throughput under load.
 * Run with: node scripts/benchmark.js
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT || '10');
const TOTAL_REQUESTS = parseInt(process.env.TOTAL || '100');

const endpoints = [
  { path: '/health', method: 'GET', name: 'Health Check' },
  { path: '/api/communities', method: 'GET', name: 'List Communities' },
  { path: '/api/proposals', method: 'GET', name: 'List Proposals' },
];

function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const start = Date.now();
    const request = http.get(`${BASE_URL}${endpoint.path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        resolve({
          endpoint: endpoint.name,
          status: res.statusCode,
          duration,
          size: data.length
        });
      });
    });
    request.on('error', (err) => {
      resolve({
        endpoint: endpoint.name,
        error: err.message,
        duration: Date.now() - start
      });
    });
  });
}

async function runBenchmark() {
  console.log('🚀 AgoraX Performance Benchmark');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Concurrent: ${CONCURRENT_REQUESTS}`);
  console.log(`Total: ${TOTAL_REQUESTS}`);
  console.log('');

  const results = {};
  const startTime = Date.now();

  // Run requests concurrently
  const promises = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    const endpoint = endpoints[i % endpoints.length];
    promises.push(makeRequest(endpoint));
  }

  const allResults = await Promise.all(promises);

  // Aggregate results
  allResults.forEach(result => {
    if (!results[result.endpoint]) {
      results[result.endpoint] = { durations: [], errors: 0 };
    }
    if (result.error) {
      results[result.endpoint].errors++;
    } else {
      results[result.endpoint].durations.push(result.duration);
    }
  });

  const totalTime = Date.now() - startTime;

  // Print results
  console.log('📊 Results:');
  console.log('');

  for (const [endpoint, data] of Object.entries(results)) {
    const durations = data.durations;
    if (durations.length === 0) {
      console.log(`${endpoint}: ALL REQUESTS FAILED`);
      continue;
    }

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];

    console.log(`${endpoint}:`);
    console.log(`  Requests: ${durations.length}/${TOTAL_REQUESTS / endpoints.length}`);
    console.log(`  Avg: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min}ms`);
    console.log(`  Max: ${max}ms`);
    console.log(`  P95: ${p95}ms`);
    console.log(`  Errors: ${data.errors}`);
    console.log('');
  }

  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log(`📈 Throughput: ${(TOTAL_REQUESTS / (totalTime / 1000)).toFixed(2)} req/s`);
}

runBenchmark().catch(console.error);
