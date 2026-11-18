.PHONY: docker-up docker-down docker-logs docker-build dev dev-backend dev-frontend db-up db-down migrate lint lint-backend lint-frontend test test-backend test-frontend e2e types install

install:
	cd backend && uv sync
	cd frontend && npm install

# frontend/.env.local (if present) overrides the root .env, so build args get the real Clerk key
COMPOSE = docker compose --env-file .env $(if $(wildcard frontend/.env.local),--env-file frontend/.env.local) -f docker/docker-compose.yml

db-up:
	$(COMPOSE) up -d db

db-down:
	$(COMPOSE) stop db

# Full stack in containers (db, migrate, backend, frontend)
docker-build:
	$(COMPOSE) --profile app build

docker-up:
	$(COMPOSE) --profile app up -d --build

docker-down:
	$(COMPOSE) --profile app down

docker-logs:
	$(COMPOSE) --profile app logs -f

migrate:
	cd backend && uv run alembic upgrade head

dev:
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

lint: lint-backend lint-frontend

lint-backend:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app

lint-frontend:
	cd frontend && npm run lint && npx tsc --noEmit

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm run test

e2e:
	cd frontend && npx playwright test

types:
	cd backend && uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > ../frontend/.openapi.json
	cd frontend && npx openapi-typescript .openapi.json -o lib/api-types.ts && rm .openapi.json
