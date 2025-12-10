#!/bin/bash
set -e

echo "íº€ Starting custom deployment with pnpm..."

# Install pnpm
echo "í³¦ Installing pnpm..."
npm install -g pnpm@10.17.1

# Display versions
echo "í³Š Versions:"
node -v
npm -v
pnpm -v

# Install dependencies
echo "í³¥ Installing dependencies with pnpm..."
pnpm install --frozen-lockfile --prod=false

# Build TypeScript
echo "í´¨ Building TypeScript..."
pnpm run build

echo "âœ… Deployment completed successfully!"
