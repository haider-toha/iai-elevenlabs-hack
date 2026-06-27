# Frontend task runner (single Next.js app).
# Requires GNU Make 3.81+ (macOS default) and BSD-compatible grep/awk.
SHELL := /bin/bash

FRONTEND := frontend

.PHONY: help setup install install-frontend \
        dev dev-frontend \
        format format-frontend \
        lint lint-frontend \
        typecheck typecheck-frontend \
        test test-frontend \
        clean

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: install ## Install deps and create .env from the example
	cp -n $(FRONTEND)/.env.example $(FRONTEND)/.env || true

install: install-frontend ## Install all dependencies

install-frontend: ## Install frontend deps (pnpm)
	cd $(FRONTEND) && pnpm install

dev: dev-frontend ## Run the frontend dev server (:3000)

dev-frontend: ## Run the frontend (:3000)
	cd $(FRONTEND) && pnpm dev

format: format-frontend ## Format all code

format-frontend: ## Format frontend (prettier)
	cd $(FRONTEND) && pnpm run format

lint: lint-frontend ## Lint all code

lint-frontend: ## Lint frontend (eslint)
	cd $(FRONTEND) && pnpm run lint

typecheck: typecheck-frontend ## Type-check all code

typecheck-frontend: ## Type-check frontend (tsc)
	cd $(FRONTEND) && pnpm run typecheck

test: test-frontend ## Run all tests

test-frontend: ## Run frontend tests
	cd $(FRONTEND) && pnpm test

clean: ## Remove build artifacts and tool caches
	rm -rf $(FRONTEND)/.next $(FRONTEND)/*.tsbuildinfo
