#!/bin/bash
echo "Bootstrapping EHR Platform Core Infrastructure..."
docker-compose --profile core up -d
echo "Core infrastructure is running. (Use 'docker-compose --profile full up -d' for the complete stack)"
