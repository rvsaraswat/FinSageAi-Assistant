#!/usr/bin/env node

/**
 * FinSageAi Assistant - Setup Verification Script
 * 
 * Checks if all prerequisites are met before running the application
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let hasErrors = false;
let hasWarnings = false;

function success(message) {
  console.log(`${GREEN}✅ ${message}${RESET}`);
}

function error(message) {
  console.log(`${RED}❌ ${message}${RESET}`);
  hasErrors = true;
}

function warning(message) {
  console.log(`${YELLOW}⚠️  ${message}${RESET}`);
  hasWarnings = true;
}

function info(message) {
  console.log(`ℹ️  ${message}`);
}

async function checkNodeVersion() {
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    
    if (major >= 18) {
      success(`Node.js version: ${version}`);
      return true;
    } else {
      error(`Node.js version ${version} is too old. Please upgrade to v18 or higher.`);
      return false;
    }
  } catch (err) {
    error(`Failed to check Node.js version: ${err.message}`);
    return false;
  }
}

async function checkDependencies() {
  try {
    await fs.access('./node_modules');
    success('Dependencies installed (node_modules found)');
    return true;
  } catch {
    error('Dependencies not installed. Run: npm install');
    return false;
  }
}

async function checkEnvFile() {
  try {
    await fs.access('.env');
    success('.env file exists');
    return true;
  } catch {
    error('.env file not found. Copy .env.example to .env and configure it.');
    return false;
  }
}

async function checkEnvVariables() {
  try {
    dotenv.config();
    
    const required = ['KITE_API_KEY', 'KITE_API_SECRET'];
    const optional = ['OLLAMA_URL', 'PORT', 'MCP_REMOTE'];
    
    let allConfigured = true;
    
    for (const key of required) {
      const value = process.env[key];
      if (!value || value === 'your_api_key_here' || value === 'your_api_secret_here' || value === 'APIKEY' || value === 'APISECRET') {
        error(`${key} not configured in .env file`);
        allConfigured = false;
      } else {
        success(`${key} configured (${value.substring(0, 8)}...)`);
      }
    }
    
    // Check optional but important variables
    if (!process.env.OLLAMA_URL) {
      warning('OLLAMA_URL not set, will default to http://localhost:11434');
    }
    
    if (!process.env.PORT) {
      warning('PORT not set, will default to 15600');
    }
    
    return allConfigured;
  } catch (err) {
    error(`Failed to check environment variables: ${err.message}`);
    return false;
  }
}

async function checkOllama() {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      
      if (models.length > 0) {
        success(`Ollama is running (${models.length} models available)`);
        info(`   Models: ${models.map(m => m.name).join(', ')}`);
        return true;
      } else {
        warning('Ollama is running but no models installed. Run: ollama pull llama3.1:8b');
        return false;
      }
    } else {
      error('Ollama returned an error. Is it running? Try: ollama serve');
      return false;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      error('Ollama connection timeout. Is Ollama running? Try: ollama serve');
    } else {
      error(`Cannot connect to Ollama: ${err.message}. Start it with: ollama serve`);
    }
    return false;
  }
}

async function checkPort() {
  try {
    const port = process.env.PORT || 15600;
    
    // Try to connect to the port to see if it's already in use
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, {
        signal: AbortSignal.timeout(2000)
      });
      warning(`Port ${port} is already in use. Stop the existing server or change PORT in .env`);
      return false;
    } catch (err) {
      // Port is free (connection refused is good here)
      if (err.code === 'ECONNREFUSED' || err.name === 'AbortError') {
        success(`Port ${port} is available`);
        return true;
      }
      throw err;
    }
  } catch (err) {
    warning(`Could not check port availability: ${err.message}`);
    return true; // Don't fail setup for this
  }
}

async function checkGitignore() {
  try {
    const gitignoreContent = await fs.readFile('.gitignore', 'utf-8');
    if (gitignoreContent.includes('.env')) {
      success('.gitignore properly configured (excludes .env)');
      return true;
    } else {
      warning('.gitignore should include .env to prevent committing secrets');
      return true; // Don't fail, just warn
    }
  } catch {
    warning('.gitignore not found. Consider creating one to exclude .env');
    return true; // Don't fail, just warn
  }
}

async function checkDockerSetup() {
  try {
    await fs.access('./Dockerfile');
    await fs.access('./docker-compose.yml');
    success('Docker configuration files present');
    return true;
  } catch {
    info('Docker files not found (optional for local development)');
    return true; // Docker is optional
  }
}

async function main() {
  console.log('🔍 FinSageAi Assistant - Setup Verification\n');
  console.log('═══════════════════════════════════════════\n');
  
  // Core checks
  console.log('📋 Checking Prerequisites...\n');
  await checkNodeVersion();
  await checkDependencies();
  console.log('');
  
  // Configuration checks
  console.log('⚙️  Checking Configuration...\n');
  await checkEnvFile();
  await checkEnvVariables();
  await checkGitignore();
  console.log('');
  
  // Service checks
  console.log('🔌 Checking Services...\n');
  await checkOllama();
  await checkPort();
  console.log('');
  
  // Optional checks
  console.log('🐳 Checking Optional Features...\n');
  await checkDockerSetup();
  console.log('');
  
  // Summary
  console.log('═══════════════════════════════════════════\n');
  
  if (hasErrors) {
    console.log(`${RED}❌ Setup verification FAILED${RESET}`);
    console.log('Please fix the errors above before running the application.\n');
    console.log('📖 See INSTALLATION.md for detailed setup instructions.\n');
    process.exit(1);
  } else if (hasWarnings) {
    console.log(`${YELLOW}⚠️  Setup verification completed with warnings${RESET}`);
    console.log('The application should work, but some features may not function properly.\n');
    console.log('🚀 You can start the server with: npm start\n');
    process.exit(0);
  } else {
    console.log(`${GREEN}🎉 Setup verification PASSED!${RESET}`);
    console.log('Everything looks good. You can start the server with: npm start\n');
    console.log('📍 Access the app at: http://localhost:' + (process.env.PORT || 15600) + '\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error(`${RED}Fatal error during verification: ${err.message}${RESET}`);
  process.exit(1);
});
