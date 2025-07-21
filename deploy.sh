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

echo "🏗️ Building frontend for production..."
VITE_API_URL=https://mindfullearning.se/api npm run build

echo "✅ Deployment complete. App is live at https://mindfullearning.se"
