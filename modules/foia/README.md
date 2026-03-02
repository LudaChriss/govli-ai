# Govli AI - FOIA Module

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env
# Edit .env with your Anthropic API key

# 4. Run database migrations (after Phase 1)
npm run migrate up

# 5. Start development
npm run dev
```
