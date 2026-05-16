# 🚀 Release Checklist for Public Repository

Use this checklist when preparing to publish FinSageAi Assistant to a new public repository.

## Pre-Release Checks

### 1. Security Audit
- [ ] Remove all sensitive data from git history
- [ ] Verify `.env` is in `.gitignore`
- [ ] Check no API keys/tokens in any committed files
- [ ] Review all code comments for sensitive information
- [ ] Ensure `.env.example` has placeholders only

### 2. Code Quality
- [ ] All console.logs reviewed (no sensitive data)
- [ ] Error messages don't expose system internals
- [ ] Code follows project standards (see CONTRIBUTING.md)
- [ ] No hardcoded credentials or endpoints
- [ ] ES6 module syntax used consistently

### 3. Documentation
- [ ] README.md updated with installation instructions
- [ ] INSTALLATION.md complete and tested
- [ ] All example commands tested and verified
- [ ] License file present (MIT)
- [ ] CONTRIBUTING.md guidelines clear
- [ ] .github/copilot-instructions.md updated

### 4. Configuration Files
- [ ] `.gitignore` created and tested
- [ ] `.env.example` has all required variables
- [ ] `package.json` has correct repository URL
- [ ] `docker-compose.yml` uses environment variables
- [ ] No absolute paths in code (use relative paths)

### 5. Testing
- [ ] Fresh install on clean machine works
- [ ] `npm install` completes without errors
- [ ] `node verify-setup.js` passes all checks
- [ ] Authentication flow works end-to-end
- [ ] Portfolio fetching works
- [ ] Order placement with confirmation works
- [ ] Docker build succeeds
- [ ] All documentation links work

## Repository Setup

### 1. Create New Repository
```bash
# On GitHub, create new repository: YOUR_USERNAME/FinSageAi-Assistant
# Choose: Public, No README (we have one), MIT License
```

### 2. Prepare Clean Copy
```powershell
# Create a new directory for clean copy
New-Item -ItemType Directory -Path "E:\FinSageAi-Assistant-Public"
cd "E:\FinSageAi-Assistant-Public"

# Initialize git
git init
git branch -M main
```

### 3. Copy Files (Exclude Personal Data)
```powershell
# Copy only distribution files
$files = @(
    ".dockerignore",
    ".env.example",
    ".gitignore",
    ".github\copilot-instructions.md",
    "CHARTS_GUIDE.md",
    "CONTRIBUTING.md",
    "DOCKER_DEPLOYMENT.md",
    "docker-compose.yml",
    "Dockerfile",
    "INSTALLATION.md",
    "kiteClient.js",
    "KITE_AUTH_GUIDE.md",
    "LICENSE",
    "mcpClient.js",
    "package.json",
    "public\*",
    "README.md",
    "server.js",
    "SETUP_ZERODHA_DATA.md",
    "verify-setup.js"
)

# DO NOT COPY:
# - .env (contains real credentials)
# - node_modules (install fresh)
# - package-lock.json (generated)
# - zerodha_ai_prompt.txt (development notes)
# - Any personal test data
```

### 4. Update Repository URLs
Edit these files to replace placeholders:

**package.json**
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/FinSageAi-Assistant.git"
  },
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/FinSageAi-Assistant/issues"
  }
}
```

**README.md**
- Update clone URL
- Update issue/discussion links

### 5. Initial Commit
```bash
git add .
git commit -m "Initial commit: FinSageAi Assistant v1.0.0"
```

### 6. Push to GitHub
```bash
git remote add origin https://github.com/YOUR_USERNAME/FinSageAi-Assistant.git
git push -u origin main
```

## Post-Release

### 1. Repository Settings
- [ ] Add repository description
- [ ] Add topics: `trading`, `zerodha`, `ollama`, `ai`, `portfolio-management`, `kite-connect`
- [ ] Enable Issues
- [ ] Enable Discussions
- [ ] Set up branch protection rules for `main`

### 2. Create Release
```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0: Initial public release"
git push origin v1.0.0

# Create release on GitHub with:
# - Version: v1.0.0
# - Title: "FinSageAi Assistant v1.0.0"
# - Description: Feature list and installation link
```

### 3. Documentation
- [ ] Create Wiki pages for advanced topics
- [ ] Add screenshots to README
- [ ] Create demo video (optional)
- [ ] Write blog post/announcement (optional)

### 4. Community
- [ ] Create issue templates
- [ ] Create PR template
- [ ] Add CODE_OF_CONDUCT.md
- [ ] Set up GitHub Actions for CI (optional)

### 5. Promote (Optional)
- [ ] Share on Reddit (r/algotrading, r/IndiaInvestments)
- [ ] Tweet about the release
- [ ] Post on Zerodha TradingQ&A
- [ ] Add to awesome-lists (awesome-trading)

## Security Checklist

### Before Each Release
- [ ] Rotate all API credentials used during testing
- [ ] Verify no tokens in git history:
  ```bash
  git log --all --full-history --source -- '*env*'
  ```
- [ ] Check for secrets with tools:
  ```bash
  # Install gitleaks
  gitleaks detect --source . --verbose
  ```
- [ ] Review dependencies for vulnerabilities:
  ```bash
  npm audit
  ```

## Maintenance Checklist

### Regular Updates
- [ ] Keep dependencies updated
- [ ] Monitor security advisories
- [ ] Respond to issues within 48 hours
- [ ] Review and merge PRs promptly
- [ ] Update documentation as features evolve

### Version Management
Follow semantic versioning:
- **Major (v2.0.0):** Breaking changes
- **Minor (v1.1.0):** New features, backward compatible
- **Patch (v1.0.1):** Bug fixes

## Support Channels

After release, monitor:
- GitHub Issues
- GitHub Discussions
- Pull Requests
- Security advisories

---

## Quick Command Reference

```bash
# Clean start
rm -rf node_modules package-lock.json
npm install

# Security audit
npm audit
npm audit fix

# Test build
docker build -t finsageai-test .
docker run -p 15600:15600 --env-file .env finsageai-test

# Check for secrets
git log --all --source -- '*.env'
git grep -i 'api_key\|secret\|token\|password'

# Tag release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

---

**✅ Ready to publish!** Once all checks pass, your repository is ready for the community.
