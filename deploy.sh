#!/bin/bash

set -e  # Exit immediately on error

echo "📥 Pulling latest code..."
git pull origin main

echo "📦 Installing backend dependencies..."
cd backend
npm install

echo "🚀 Starting or restarting backend with PM2..."
pm2 start ecosystem.config.cjs --env production

echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install

# Ensure higher heap size just for this command (4–6 GB is typical; pick what your box can spare)
export NODE_OPTIONS="--max-old-space-size=6144"
NODE_OPTIONS="--max-old-space-size=4096" npm --prefix frontend run build
unset NODE_OPTIONS

echo "🏗️ Building frontend for production..."
export VITE_API_URL=""
npm run build

echo "✅ Deployment complete. App is live at https://mindfullearning.se"
