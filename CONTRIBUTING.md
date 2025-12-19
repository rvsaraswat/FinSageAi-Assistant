# Contributing to FinSageAi Assistant

Thank you for considering contributing to FinSageAi Assistant! This document provides guidelines and instructions for contributing.

## Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [How Can I Contribute?](#how-can-i-contribute)
3. [Development Setup](#development-setup)
4. [Coding Standards](#coding-standards)
5. [Commit Guidelines](#commit-guidelines)
6. [Pull Request Process](#pull-request-process)

---

## Code of Conduct

### Our Standards
- Be respectful and inclusive
- Welcome newcomers and beginners
- Focus on constructive feedback
- Prioritize user security and privacy

### Financial Software Responsibility
This software handles real trading accounts. Always:
- Test thoroughly before submitting changes
- Document security implications
- Never commit API credentials or tokens
- Add warnings for risky operations

---

## How Can I Contribute?

### 🐛 Reporting Bugs
Before creating a bug report:
1. Check existing issues to avoid duplicates
2. Test with the latest version
3. Collect relevant logs and configuration

Include in your report:
- **Description:** Clear description of the bug
- **Steps to Reproduce:** Numbered list
- **Expected Behavior:** What should happen
- **Actual Behavior:** What actually happens
- **Environment:** OS, Node version, Ollama version
- **Logs:** Relevant error messages (remove sensitive data!)

### 💡 Suggesting Features
Feature requests are welcome! Please include:
- **Use Case:** Why is this feature needed?
- **Proposed Solution:** How should it work?
- **Alternatives:** Other approaches considered
- **Risk Assessment:** Security/financial implications

### 📝 Improving Documentation
Documentation improvements are always appreciated:
- Fix typos or unclear instructions
- Add examples or screenshots
- Translate to other languages
- Update outdated information

### 🔧 Code Contributions
We welcome pull requests for:
- Bug fixes
- New features
- Performance improvements
- Test coverage
- Code refactoring

---

## Development Setup

### 1. Fork and Clone
```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/FinSageAi-Assistant.git
cd FinSageAi-Assistant
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
# Copy example file
cp .env.example .env

# Edit with your test credentials
nano .env
```

⚠️ **IMPORTANT:** Use a separate Zerodha test account for development, not your production account!

### 4. Create a Branch
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 5. Run the Development Server
```bash
npm start
```

### 6. Test Your Changes
- Manually test affected features
- Run the verification script: `node verify-setup.js`
- Check browser console for errors
- Test with different Ollama models

---

## Coding Standards

### JavaScript Style Guide

#### ES6 Modules
This project uses ES6 modules (`"type": "module"` in package.json):
```javascript
// ✅ Correct
import express from 'express';
import { getHoldings } from './kiteClient.js';

// ❌ Wrong
const express = require('express');
```

#### Async/Await
Prefer async/await over promises:
```javascript
// ✅ Correct
async function fetchData() {
  try {
    const result = await callAPI();
    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// ❌ Avoid
function fetchData() {
  return callAPI()
    .then(result => result)
    .catch(error => console.error(error));
}
```

#### Error Handling
Always handle errors gracefully:
```javascript
// ✅ Correct
try {
  const holdings = await getHoldings();
  return holdings;
} catch (error) {
  console.error('[Portfolio] Failed to fetch holdings:', error);
  throw new Error('Could not fetch portfolio data. Please authenticate first.');
}
```

#### Logging
Use descriptive log prefixes:
```javascript
console.log('[Kite API] Fetching holdings...');
console.log('[LLM] Response complete: 1234 chars');
console.error('[Auth] Token exchange failed:', error);
```

#### Security
Never log sensitive data:
```javascript
// ✅ Correct
console.log(`API Key: ${apiKey.substring(0, 8)}...`);

// ❌ Wrong
console.log(`API Key: ${apiKey}`);
```

### File Structure
```
├── server.js              # Main Express server and API routes
├── kiteClient.js          # Direct Kite Connect API calls
├── mcpClient.js           # MCP protocol client (remote)
├── verify-setup.js        # Setup verification script
├── public/
│   ├── index.html         # Frontend UI
│   ├── script.js          # Frontend logic
│   └── style.css          # Styling
├── .github/
│   └── copilot-instructions.md  # AI agent instructions
└── *.md                   # Documentation files
```

### Documentation Standards
- Use Markdown for all documentation
- Include code examples for complex features
- Add inline comments for non-obvious logic
- Update relevant `.md` files when adding features

---

## Commit Guidelines

### Commit Message Format
```
<type>: <subject>

<optional body>

<optional footer>
```

### Types
- **feat:** New feature
- **fix:** Bug fix
- **docs:** Documentation changes
- **style:** Code style changes (formatting, no logic change)
- **refactor:** Code refactoring
- **test:** Adding or updating tests
- **chore:** Maintenance tasks

### Examples
```bash
feat: Add portfolio allocation pie chart

Implemented chart rendering using Chart.js to visualize
portfolio allocation by stock value.

Closes #42

---

fix: Handle CDSL authorization error for sell orders

Added user-friendly error message with instructions to
authorize holdings in Zerodha Console before selling.

Fixes #38

---

docs: Update INSTALLATION.md with Docker setup

Added section on Docker deployment with docker-compose
configuration examples.
```

### Rules
- Use present tense ("Add feature" not "Added feature")
- Keep subject line under 50 characters
- Capitalize subject line
- No period at the end of subject
- Separate subject from body with blank line

---

## Pull Request Process

### Before Submitting
1. ✅ Test your changes locally
2. ✅ Run `node verify-setup.js`
3. ✅ Update documentation if needed
4. ✅ Check for console errors
5. ✅ Ensure no sensitive data in commits
6. ✅ Rebase on latest `main` branch

### PR Description Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Performance improvement

## Testing
Describe how you tested this change:
- [ ] Manual testing on local setup
- [ ] Tested with Ollama models: llama3.1:8b, qwen2.5:14b
- [ ] Verified portfolio fetching works
- [ ] Tested order placement (with confirmation flow)

## Screenshots (if applicable)
Add screenshots for UI changes

## Related Issues
Closes #123
Fixes #456

## Checklist
- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] No console errors
- [ ] Sensitive data removed
- [ ] Commits are clean and logical
```

### Review Process
1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, maintainers will merge

### After Merge
- Delete your feature branch
- Pull latest changes from main
- Celebrate! 🎉

---

## Project-Specific Guidelines

### Working with Kite API
- Always test with small quantities
- Check market hours before testing orders
- Handle AMO (After Market Orders) gracefully
- Document any new error codes encountered

### Working with Ollama
- Test with multiple models (small and large)
- Handle streaming responses correctly
- Implement fallback for `/api/chat` → `/api/generate`
- Document model-specific behaviors

### Frontend Development
- Use vanilla JavaScript (no frameworks)
- Keep UI responsive and accessible
- Test on multiple browsers
- Extract code blocks (orders, charts) correctly

### Security Considerations
- Never commit `.env` file
- Sanitize user inputs
- Validate all API responses
- Use HTTPS in production
- Implement rate limiting for sensitive operations

---

## Getting Help

### Resources
- **Documentation:** Read all `.md` files
- **Code Examples:** Check existing implementations
- **Issues:** Search existing issues for similar problems
- **API Docs:** 
  - [Kite Connect API](https://kite.trade/docs/connect/v3/)
  - [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

### Questions?
- Open a GitHub issue with the `question` label
- Be specific about what you're trying to achieve
- Include relevant code snippets
- Describe what you've already tried

---

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes
- Project README (for significant contributions)

Thank you for helping make FinSageAi Assistant better! 🚀

