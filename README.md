# Elenchos

Argument analysis using two LLM agents (extractor and critic), a logic engine (propositional logic and first-order model finding), and an interactive argument map. Python backend and React frontend, both using a capability-based architecture.

## Quick Start

Requirements: [uv](https://docs.astral.sh/uv/), [bun](https://bun.sh), Docker, and [Ollama](https://ollama.com).

```bash
cp .env.example .env
make ollama-pull          # pulls the default model (OLLAMA_MODEL in .env)
make dev                  # db + backend (:8000, reload) + frontend (:5173, hot reload)
make app                  # db + production build, everything at http://localhost:8000
```

Run `make help` to see all available targets. The database runs in a container named `elenchos-db` (volume `elenchos-pgdata`, host port `5433`). Run `make db-reset` to clear the database.

## Logging

The backend writes concise log entries to stdout in the following format: `2026-10-09 22:56:41 INFO [argmap.http] GET /api/capabilities completed (200)`. Matched API endpoints and available capabilities/adapters are logged; server errors appear as `ERROR`.

Warning messages, repeated storage operations, and external library logs are suppressed. Model streams log their start, completion or failure, and Ollama progress: waiting for the first token, time to first token, and elapsed time plus the number of chunks received every 15 seconds.

Generated content is never logged. Relevant capability functions log their operation at startup using module-specific logger names, such as `[argmap.capabilities.storage.service]`. Prompts, responses, API keys, document contents, and user IDs are never logged.

Request IDs remain available in response headers but are not logged. Logs do not contain prompts, model responses, API keys, document contents, or user IDs.

## Capabilities

| Capability    | Description                       | Backend adapters  | Frontend adapters |
| ------------- | --------------------------------- | ----------------- | ----------------- |
| reasoning     | Analysis and model streaming      | ollama, anthropic | HTTP (NDJSON)     |
| storage       | Documents and local user identity | postgres, memory  | HTTP              |
| observability | Logging and request middleware    | Python logging    | N/A               |

All HTTP routers are located under `capabilities/routers/`; `app/api.py` only composes them. The routers call domain services in `reasoning/` and `storage/`.

`/api/capabilities` preserves the existing response keys for frontend compatibility. The reasoning router also preserves the existing `GET /api/providers` and `POST /api/sample` routes.

PostgreSQL in Docker is the persistent store. Its named Docker volume preserves data across app and container restarts; `docker compose down` keeps the volume. The app refuses to start with the PostgreSQL adapter if the database is unavailable, rather than silently running without saving. Start it with `make db-up` (or `docker compose up -d --wait db`). `make db-reset` explicitly deletes the database volume and all saved data. No local-file fallback is used.

## Choosing a Model

Choose **Ollama** for local use or **Anthropic** for API-based analysis. Ollama models are loaded from your local installation.

Anthropic requires an API key in the UI, which is sent only with analysis requests, or can optionally use `ANTHROPIC_API_KEY` as a server-side fallback.

**OpenAI** appears as a disabled placeholder in the model selector; no adapter has been implemented yet.

## Argument Analysis

On the **Argument Map** tab, you can analyze text or an example using two sequential model calls: the first reconstructs claims and reasoning steps, while the second independently reviews them.

Choose quick, standard, or thorough as the analysis depth. The local logic engine checks formalizations, and the map displays supporting arguments, counterarguments, assumptions, and findings.

The **Disagreements** tab compares the judgments of both agents with the logic engine.

The **Logic Lab** sends checks to the backend's deterministic logic service (`POST /api/logic/check`), which supports propositional logic and bounded finite-model search for predicate logic. Formalisation checks on the argument map continue to run locally.

Analyses are saved incrementally and upon completion through the existing storage capability. They can be reopened, deleted, and exported as Markdown or JSON.

The analysis uses the existing `POST /api/sample` streaming endpoint for both model calls and `/api/store` for saved analyses. No separate backend analysis endpoint is required.

## Project Structure

```text
backend/    uv project; app/main.py composes the application,
            app/api.py only mounts HTTP routers from capabilities/routers/,
            core/ (configuration, registry, and shared HTTP dependencies),
            capabilities/reasoning/ (agent/model streaming and providers),
            capabilities/storage/ (document persistence and user identity),
            capabilities/observability/ (logging and request middleware),
            capabilities/routers/ (HTTP transport for the capabilities),
            models.py, tests/

frontend/   bun, Vite, React, TypeScript; src/App.tsx composes views,
            views/ (page UI), capabilities/<feature>/ (state, API, and helpers, including analysis),
            components/ (shared UI), i18n/, types.ts

legacy/     original HTML file, split by module (source for the port)

docs/PROGRESS.md   build status and decisions: read this first when
                   continuing work on another machine
```
# elenchos
# elenchos
