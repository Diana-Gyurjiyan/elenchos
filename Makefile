# Elenchos: Python backend (uv) + React frontend (bun) + Postgres in Docker.
# `make dev`  : db + backend (reload, :8000) + Vite dev server (:5173) with hot reload
# `make app`  : db + production build of the frontend, served by the backend on :8000
SHELL := /bin/bash
.DEFAULT_GOAL := help

BACKEND_PORT  ?= 8000
FRONTEND_PORT ?= 5173
COMPOSE       ?= docker compose
OLLAMA_URL    ?= http://localhost:11434
OLLAMA_MODEL  ?= $(or $(shell grep -s "^OLLAMA_MODEL=" .env | cut -d= -f2),llama3.1:8b)

.PHONY: help install env ollama-check ollama-pull db-up db-down db-reset db-logs dev app build test lint fmt typecheck zip clean

help: ## Show this help
	@grep -E "^[a-zA-Z_-]+:.*?## " $(MAKEFILE_LIST) | awk "BEGIN{FS=\":.*?## \"}{printf \"  \033[36m%-12s\033[0m %s\n\", \$$1, \$$2}"

env: ## Create .env from .env.example when missing
	@test -f .env || (cp .env.example .env && echo "Created .env (add your ANTHROPIC_API_KEY)")

install: env ## Install backend (uv) and frontend (bun) dependencies
	cd backend && uv sync
	cd frontend && bun install

ollama-check: ## Warn (not fail) when the default local LLM is not reachable
	@curl -fs --max-time 2 $(OLLAMA_URL)/api/tags >/dev/null \
	  && echo "Ollama OK ($(OLLAMA_URL))" \
	  || echo "WAARSCHUWING: Ollama niet bereikbaar op $(OLLAMA_URL). Start het met 'ollama serve', of kies een API-model in de UI."

ollama-pull: ## Download the default Ollama model (OLLAMA_MODEL from .env)
	ollama pull $(OLLAMA_MODEL)

db-up: env ## Start the Postgres container (elenchos-db) and wait until healthy
	$(COMPOSE) up -d --wait db

db-down: ## Stop the database container (data volume is kept)
	$(COMPOSE) down

db-reset: ## Stop the database AND delete its data volume
	$(COMPOSE) down -v

db-logs: ## Follow database logs
	$(COMPOSE) logs -f db

dev: install db-up ollama-check ## Run everything with hot reload (backend :8000, frontend :5173)
	@echo "Frontend: http://localhost:$(FRONTEND_PORT)   API: http://localhost:$(BACKEND_PORT)/api/capabilities"
	@trap "kill 0" EXIT INT TERM; \
	(cd backend && uv run uvicorn app.main:app --reload --port $(BACKEND_PORT)) & \
	(cd frontend && bun run dev --port $(FRONTEND_PORT)) & \
	wait

build: ## Build the frontend into frontend/dist
	cd frontend && bun install && bun run build

app: install db-up ollama-check build ## Run the production app on one port (backend serves the built frontend)
	@echo "App: http://localhost:$(BACKEND_PORT)"
	cd backend && uv run uvicorn app.main:app --port $(BACKEND_PORT)

test: ## Run backend and frontend tests
	cd backend && uv run pytest -q
	cd frontend && bun run test

lint: ## Lint backend (ruff) and typecheck frontend
	cd backend && uv run ruff check .
	cd frontend && bun run typecheck

fmt: ## Format backend code
	cd backend && uv run ruff format . && uv run ruff check --fix .

zip: ## Zip the repository (without node_modules, .venv, dist, .env)
	@rm -f elenchos.zip
	zip -r elenchos.zip . -x "*/node_modules/*" "*/.venv/*" "*/dist/*" "*/__pycache__/*" ".env" ".git/*" "*.zip" "*/.pytest_cache/*" "*/.ruff_cache/*"

clean: ## Remove build artefacts and caches
	rm -rf frontend/dist frontend/node_modules backend/.venv backend/.pytest_cache backend/.ruff_cache
