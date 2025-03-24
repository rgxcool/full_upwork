#!/bin/bash
cd ~/mindful-new
git pull origin main
docker-compose pull
docker-compose up -d --build
docker system prune -f
