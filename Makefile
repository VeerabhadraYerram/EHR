.PHONY: help up down dev-up dev-down logs test clean

help:
	@echo "EHR Platform Makefile"
	@echo "-----------------------"
	@echo "up        : Start all services via docker-compose"
	@echo "down      : Stop all services"
	@echo "dev-up    : Start local development infrastructure (DBs, queues, etc.)"
	@echo "dev-down  : Stop local development infrastructure"
	@echo "logs      : Tail logs for all services"
	@echo "test      : Run all tests"
	@echo "clean     : Remove python cache files and test artifacts"

up:
	docker-compose up -d

down:
	docker-compose down

dev-up:
	docker-compose -f docker-compose.dev.yml up -d

dev-down:
	docker-compose -f docker-compose.dev.yml down

logs:
	docker-compose logs -f

test:
	pytest tests/

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
