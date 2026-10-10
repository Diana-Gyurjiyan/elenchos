# Build state (read this first when continuing on another machine)

Source of truth for the original app: `legacy/Argument_Mapper.html`, split in `legacy/src/`
(logic-engine.js, 00-i18n.js, 10-core.js, 20-lab.js, 30-agents.js, 35-disagree.js, 38-store.js,
40-map.js, 90-boot.js, markup.html). CSS is already extracted to `frontend/src/styles/app.css`.

## Architecture
Capability based on both sides. A capability = named port + adapter, resolved by a registry.
| capability | backend (Python)                          | frontend (React)                         |
|------------|-------------------------------------------|------------------------------------------|
| reasoning  | Ollama, Anthropic; OpenAI placeholder      | reasoning HTTP routes                   |
| storage    | Postgres (jsonb) or memory; local identity | storage and identity HTTP routes        |
| observability | Python logging and request middleware   | n/a                                     |
| logic      | Python logic service and `/api/logic/check` | HTTP Logic Lab + local analysis adapter |

Frontend capability ports continue to use the public compatibility names (`sample`, `store`, `user`);
the backend domain services are `reasoning` and `storage`.

## Decisions
- D1 `make dev` = db + uvicorn --reload (:8000) + vite (:5173, proxies /api). `make app` = db + build + backend serves dist on :8000.
- D2 DB container is named `elenchos-db` (volume `elenchos-pgdata`, host port 5433).
- D3 Logic Lab checks run in the Python backend; map formalisation checks retain the local deterministic engine.
- D4 Ollama and Anthropic are supported model providers; OpenAI is a disabled UI placeholder. The user chooses provider and model in the title-bar Settings modal, stored in localStorage. Analysis depth (quick/standard/thorough) remains a separate prompt option.
- D5 Ollama is local and uses no API key. Anthropic keys are sent per request from the browser or supplied as an optional server fallback.
- D6 Backend domain capabilities are `reasoning`, `storage`, `logic`, and `observability`. All HTTP transport is under `capabilities/routers/`; `app/api.py` only composes these routers, and `core/` contains shared configuration, dependencies, and the capability registry.
- D7 Ollama needs a big context window for these prompts: OLLAMA_NUM_CTX defaults to 16384.
- D8 HTTP routers are composed from `capabilities/routers/`; the reasoning router preserves `GET /api/providers` and `POST /api/sample` for API compatibility.

## Stages
- [x] Stage 1  Repo skeleton, Makefile, docker compose, backend capabilities + routers, Ollama and Anthropic model picker + tests, frontend capability layer
- [x] Stage 2  Logic Lab UI and engine ported. Engine as ES module (`capabilities/logic/engine.js` + `engine.d.ts`, behaviour unchanged, 10 tests),
              local logic port, i18n (`src/i18n`, JSON catalogues with 243 keys each + `I18nProvider`/`useI18n`),
              `capabilities/logic/{verdict.ts,ResultView.tsx}` and `views/LogicLabView.tsx` (ResultBody has `compact` mode for the map's detail panel),
              app shell with tabs (map/dis/lab) and NL/EN switch. LogicLab accepts a `seed` prop
              ({premises, conclusion, nonce}) for the wired "open in lab" handoff from the map.
- [x] Stage 6  Native Python logic service exposed at `POST /api/logic/check`; Logic Lab uses the backend API, with prop and finite-model predicate checking.
- [x] Stage 3  Two-agent analysis pipeline in `capabilities/analysis/useAnalysis.ts`, tolerant streamed JSON-object parser,
              bounded record normalization, local formalisation checks, cancellation and provider error translations.
- [x] Stage 4  Layered interactive SVG argument map, details and Logic Lab handoff; disagreement comparisons for agent ratings,
              role disputes, critic findings and engine results.
- [x] Stage 5  Analysis checkpoints and saved-analysis list via the existing store capability; reopen/recheck, delete,
              Markdown and JSON export, English/Dutch UI strings, and focused analysis tests.

## Run
make install && make dev   (needs uv, bun, docker; copy .env.example to .env and set ANTHROPIC_API_KEY)
