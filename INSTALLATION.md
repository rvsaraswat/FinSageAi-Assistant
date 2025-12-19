# FinSageAi Assistant - Installation Guide

Complete step-by-step guide to set up your own instance of FinSageAi Assistant.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Zerodha Kite API Setup](#zerodha-kite-api-setup)
3. [Ollama Setup](#ollama-setup)
4. [Application Setup](#application-setup)
5. [First Run](#first-run)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js v18+** ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))
- **Ollama** ([Download](https://ollama.ai/))

### Required Accounts
- **Zerodha Trading Account** with Kite Connect API access (₹2,000/month subscription)

### System Requirements
- **RAM:** 8GB minimum (16GB recommended for larger models)
- **Storage:** 10GB+ free space for Ollama models
- **OS:** Windows 10/11, macOS, or Linux

---

## Zerodha Kite API Setup

### Step 1: Subscribe to Kite Connect
1. Visit https://developers.kite.trade/
2. Click **"Get Started"** and log in with your Zerodha credentials
3. Subscribe to Kite Connect (₹2,000/month)
4. Complete the payment process

### Step 2: Create Your App
1. Go to **"My Apps"** in the Kite Connect dashboard
2. Click **"Create New App"**
3. Fill in the details:
   - **App Name:** `FinSageAi Assistant` (or your choice)
   - **Redirect URL:** `http://localhost:15600`
   - **Description:** `Personal AI trading assistant`
4. Click **"Create"**

### Step 3: Get Your Credentials
After creating the app, you'll see:
- **API Key** (e.g., `abc123xyz456`)
- **API Secret** (e.g., `def789ghi012`)

⚠️ **IMPORTANT:** Keep these credentials secure! Never commit them to version control.

---

## Ollama Setup

### Step 1: Install Ollama

#### Windows
```powershell
# Download and run installer from https://ollama.ai/download
# Or use winget
winget install Ollama.Ollama
```

#### macOS
```bash
# Download and run installer from https://ollama.ai/download
# Or use Homebrew
brew install ollama
```

#### Linux
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Step 2: Start Ollama Service
```bash
ollama serve
```

Leave this terminal open. Ollama runs on `http://localhost:11434`

### Step 3: Download AI Models
In a new terminal, pull recommended models:

```bash
# Lightweight model (4GB RAM)
ollama pull llama3.1:8b

# Medium model (10GB RAM)
ollama pull qwen2.5:14b

# Large model (16GB+ RAM)
ollama pull gpt-oss:20b
```

Verify installation:
```bash
ollama list
```

---

## Application Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/FinSageAi-Assistant.git
cd FinSageAi-Assistant
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables

#### Windows (PowerShell)
```powershell
# Copy the example file
Copy-Item .env.example .env

# Edit with your credentials
notepad .env
```

#### macOS/Linux
```bash
# Copy the example file
cp .env.example .env

# Edit with your credentials
nano .env
```

#### Configuration Details
Open `.env` and fill in your Zerodha credentials:

```env
# REQUIRED: Replace with your actual Kite Connect credentials
KITE_API_KEY=your_api_key_here
KITE_API_SECRET=your_api_secret_here

# OPTIONAL: Leave empty - generated during login
KITE_ACCESS_TOKEN=

# OPTIONAL: Customize if needed
OLLAMA_URL=http://localhost:11434
PORT=15600
MCP_REMOTE=0
```

### Step 4: Verify Configuration
Run the verification script:

#### Windows (PowerShell)
```powershell
node verify-setup.js
```

#### macOS/Linux
```bash
node verify-setup.js
```

Expected output:
```
✅ Node.js version: v20.x.x
✅ Dependencies installed
✅ .env file configured
✅ Ollama is running
✅ Models available: llama3.1:8b, qwen2.5:14b
✅ Kite API credentials configured
🎉 Setup complete! Ready to start.
```

---

## First Run

### Step 1: Start the Server
```bash
npm start
```

You should see:
```
🔧 Configuration loaded:
   MCP_REMOTE: not set (local mode)
   KITE_API_KEY: ✓ configured
   KITE_ACCESS_TOKEN: ✗ missing (generate via login)
   OLLAMA_URL: http://localhost:11434
🚀 API server running on 15600
```

### Step 2: Open the Web Interface
Open your browser and go to:
```
http://localhost:15600
```

### Step 3: Authenticate with Zerodha
1. Click the **🔐 Kite Login** button
2. Log in with your Zerodha credentials
3. Complete 2FA (TOTP/SMS)
4. Authorize the app
5. You'll be redirected back to the app

✅ **Authentication successful!** You can now use all features.

### Step 4: Test the Features

#### Test 1: Chat with AI
1. Select a model from the dropdown (e.g., `llama3.1:8b`)
2. Type: "Hi, who are you?"
3. Click **Send**
4. You should get a response from FinSageAi

#### Test 2: Analyze Portfolio
1. Click **📊 Analyze Portfolio**
2. Wait for the analysis (takes 10-30 seconds)
3. You'll see:
   - Portfolio summary with charts
   - Sector allocation
   - Top performers and losers
   - AI recommendations

#### Test 3: Place Order (Optional)
⚠️ **CAUTION:** This places real orders! Test with small quantities.

1. In chat, type: "Buy 1 share of INFY at market price"
2. AI generates an order block
3. Review the details carefully
4. Type **CONFIRM** to execute (or **CANCEL** to abort)

---

## Troubleshooting

### Issue: "KITE_ACCESS_TOKEN is required"
**Solution:** Click the **🔐 Kite Login** button to authenticate. Tokens expire daily at 6 AM IST.

### Issue: "Ollama connection refused"
**Solution:** 
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not, start it
ollama serve
```

### Issue: "Model not found"
**Solution:**
```bash
# Pull the model you're trying to use
ollama pull llama3.1:8b
```

### Issue: "Port 15600 already in use"
**Solution:**
```bash
# Change port in .env
PORT=16000

# Or find and kill the process using port 15600
# Windows
netstat -ano | findstr :15600
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:15600 | xargs kill -9
```

### Issue: "After Market Order (AMO) placed instead of regular order"
**Explanation:** Market is closed. AMO orders execute when market opens (9:15 AM IST).

### Issue: "Need CDSL authorization to sell holdings"
**Solution:**
1. Go to [Zerodha Console](https://console.zerodha.com)
2. Navigate to **Portfolio → Holdings**
3. Click **Authorize** next to the stock
4. Enter your CDSL TPIN
5. Try placing the order again

---

## Docker Deployment (Advanced)

For running in Docker, see [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)

---

## Next Steps

- Read [KITE_AUTH_GUIDE.md](KITE_AUTH_GUIDE.md) for authentication details
- Check [SETUP_ZERODHA_DATA.md](SETUP_ZERODHA_DATA.md) for portfolio data setup
- Review [CHARTS_GUIDE.md](CHARTS_GUIDE.md) for custom chart generation

---

## Getting Help

- **GitHub Issues:** Report bugs or request features
- **Documentation:** Check all `.md` files in the repository
- **Health Check:** Visit http://localhost:15600/api/health to diagnose connectivity issues

---

## Security Best Practices

1. ✅ Never commit `.env` file to version control
2. ✅ Rotate API credentials if exposed
3. ✅ Use HTTPS in production deployments
4. ✅ Enable two-factor authentication on your Zerodha account
5. ✅ Review all orders before confirming execution
6. ✅ Start with small quantities when testing trade execution

---

**Ready to trade smarter!** 🚀📈
