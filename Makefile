# Polyglot monorepo task runner.
# Requires GNU Make 3.81+ (macOS default) and BSD-compatible grep/awk.
SHELL := /bin/bash

FRONTEND := frontend
BACKEND  := backend
SUPABASE := supabase

.PHONY: help setup install install-frontend install-backend \
        dev dev-frontend dev-backend \
        format format-backend format-frontend \
        lint lint-backend lint-frontend \
        typecheck typecheck-backend typecheck-frontend \
        test test-backend test-frontend \
        db-start db-reset db-migration clean

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: install ## Install deps and create .env files from examples
	cp -n $(BACKEND)/.env.example $(BACKEND)/.env || true
	cp -n $(FRONTEND)/.env.example $(FRONTEND)/.env || true

install: install-frontend install-backend ## Install all dependencies

install-frontend: ## Install frontend deps (pnpm)
	cd $(FRONTEND) && pnpm install

install-backend: ## Install backend deps (poetry)
	cd $(BACKEND) && poetry install

# Runs both servers in one terminal; Ctrl-C stops both. For cleaner separate
# logs, run `make dev-backend` and `make dev-frontend` in two terminals.
dev: ## Run frontend + backend together
	@trap 'kill 0' INT TERM; \
	( cd $(BACKEND) && poetry run uvicorn app.main:app --reload --port 8000 ) & \
	( cd $(FRONTEND) && pnpm dev ) & \
	wait

dev-backend: ## Run only the backend (:8000)
	cd $(BACKEND) && poetry run uvicorn app.main:app --reload --port 8000

dev-frontend: ## Run only the frontend (:3000)
	cd $(FRONTEND) && pnpm dev

format: format-backend format-frontend ## Format all code

format-backend: ## Format backend (ruff)
	cd $(BACKEND) && poetry run ruff format . && poetry run ruff check --fix .

format-frontend: ## Format frontend (prettier)
	cd $(FRONTEND) && pnpm run format

lint: lint-backend lint-frontend ## Lint all code

lint-backend: ## Lint backend (ruff)
	cd $(BACKEND) && poetry run ruff check .

lint-frontend: ## Lint frontend (eslint)
	cd $(FRONTEND) && pnpm run lint

typecheck: typecheck-backend typecheck-frontend ## Type-check all code

typecheck-backend: ## Type-check backend (mypy)
	cd $(BACKEND) && poetry run mypy .

typecheck-frontend: ## Type-check frontend (tsc)
	cd $(FRONTEND) && pnpm run typecheck

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests (pytest)
	cd $(BACKEND) && poetry run pytest

test-frontend: ## Run frontend tests
	cd $(FRONTEND) && pnpm test

db-start: ## Start the local Supabase stack (needs Docker)
	cd $(SUPABASE) && supabase start

db-reset: ## Reset local DB: replay migrations + seed
	cd $(SUPABASE) && supabase db reset

# Usage: make db-migration name=add_widgets_table
db-migration: ## Create a new migration (name=<migration_name>)
	@if [ -z "$(name)" ]; then \
		echo "Usage: make db-migration name=add_widgets_table"; \
		exit 1; \
	fi
	cd $(SUPABASE) && supabase migration new $(name)

clean: ## Remove build artifacts and tool caches
	rm -rf $(FRONTEND)/.next $(FRONTEND)/*.tsbuildinfo
	find $(BACKEND) -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf $(BACKEND)/.mypy_cache $(BACKEND)/.ruff_cache $(BACKEND)/.pytest_cache
