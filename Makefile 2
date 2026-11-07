.PHONY: dev dev-backend dev-frontend db-up db-down migrate lint lint-backend lint-frontend test test-backend test-frontend e2e types install

install:
	cd backend && uv sync
	cd frontend && npm install

db-up:
	docker compose up -d db

db-down:
	docker compose stop db

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
	cd backend && uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > /tmp/scholar-openapi.json
	cd frontend && npx openapi-typescript /tmp/scholar-openapi.json -o lib/api-types.ts
