# Self-Healing Software Tests: System Requirements & Installation Guide

This document outlines all the software, libraries, and environment prerequisites required to build and run the Intent-Aware, Self-Healing End-to-End Testing System.

---

## 1. System Architecture Overview

The system relies on three core tiers:
1. **Execution Engine:** Playwright (Browser Automation & DOM Inspection).
2. **AI Reasoning Agent:** Hugging Face `smolagents` or LangGraph powered by NVIDIA NIM endpoints (DeepSeek-R1 / Llama 3 / Nemotron).
3. **Source Code Analyzer:** Babel AST / TypeScript Compiler API (for code sync and change diffing).

---

## 2. Hardware & Environment Prerequisites

* **Operating System:** Cross-platform (Windows 10/11 with WSL2, macOS 12+, or Linux Ubuntu 20.04+).
* **Node.js Environment:** Node.js version `>= 18.0.0` (Required for running the CLI and Playwright runner).
* **Python Environment:** Python version `>= 3.10` (Required if integrating Hugging Face `smolagents` or Python-based AI microservices).
* **Network Access:** Internet connection to fetch NVIDIA NIM or Hugging Face LLM API endpoints and download browser binaries.

---

## 3. Dependency Checklist & Installation Commands

### Step 3.1: Node.js Core & Testing Dependencies
Run the following commands in your project root to install the necessary JavaScript/TypeScript packages:

```bash
# Initialize Node.js project
npm init -y

# Install Playwright and testing essentials
npm install playwright @playwright/test dotenv axios

# Install CLI management libraries
npm install commander chalk ora
```

### Step 3.2: Python & AI Agent Framework Dependencies (Optional / Recommended for Agentic Workflow)
If you are using Hugging Face `smolagents` or Python-based AI controllers for intent mapping:

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Hugging Face agent framework and client libraries
pip install smolagents transformers openai requests python-dotenv
```

### Step 3.3: Playwright Browser Binaries
Playwright requires browser binaries to execute automated UI checks:

```bash
npx playwright install chromium
```

---

## 4. Environment Variables (`.env`) Configuration

Create a `.env` file in the root directory of your project to manage API keys and endpoints securely:

```env
# AI Provider Configuration (NVIDIA NIM or Hugging Face)
AI_PROVIDER=nvidia_nim
NVIDIA_NIM_API_KEY=nvapi-your-api-key-here
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
MODEL_NAME=meta/llama-3.1-70b-instruct

# Application Settings
HEADLESS_MODE=false
TEST_TIMEOUT_MS=30000
```

---

## 5. Verification Checklist

Before starting development, verify that your environment is fully set up by running:

```bash
# Verify Node version
node -v

# Verify Python version
python --version

# Verify Playwright installation
npx playwright --version