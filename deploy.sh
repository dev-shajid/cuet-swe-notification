#!/bin/bash

# Shiraji Deployment Script
# This script pulls the latest code from git and deploys using docker-compose

set -e  # Exit immediately if a command exits with a non-zero status

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Pull latest code from git
echo -e "${YELLOW}[1/3] Pulling latest code from git...${NC}"
git pull origin main || {
    echo -e "${RED}Error: Failed to pull from git. Please check your git configuration.${NC}"
    exit 1
}
echo -e "${GREEN}✓ Code updated successfully${NC}"

# Step 2: Stop running containers
echo -e "${YELLOW}[2/3] Stopping running containers...${NC}"
docker compose down || {
    echo -e "${RED}Warning: Failed to stop containers. Continuing anyway...${NC}"
}
echo -e "${GREEN}✓ Containers stopped${NC}"

# Step 3: Build and start containers
echo -e "${YELLOW}[3/3] Building and starting containers...${NC}"
docker compose up -d --build || {
    echo -e "${RED}Error: Failed to start containers${NC}"
    exit 1
}
echo -e "${GREEN}✓ Containers started${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Completed Successfully!"
echo "==========================================${NC}"
echo ""
echo "To view logs, run: docker-compose logs -f"
echo "To stop containers, run: docker-compose down"
