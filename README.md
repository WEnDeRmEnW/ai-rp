# Letopis — Living AI Roleplay Engine

> A stateful text-roleplay application where the AI narrates a living world without taking control of the player character.

[![Live demo](https://img.shields.io/badge/live-2--26--80--121.sslip.io-71d3b1)](https://2-26-80-121.sslip.io)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-388%20passing-71d3b1)
![Codex](https://img.shields.io/badge/built%20with-OpenAI%20Codex-111827)
![GPT-5.6](https://img.shields.io/badge/engineering-GPT--5.6-7c3aed)

**Live application:** [https://2-26-80-121.sslip.io](https://2-26-80-121.sslip.io)

Letopis treats prose and game state as two connected but separate systems. The model can describe an injury, item, relationship change, new ability, political reaction, or world event, but that change becomes real only after it passes typed schema validation and the state engine applies it atomically.

The result is long-form roleplay with persistent consequences instead of a chatbot that gradually forgets what happened.

## Why this project exists

Most text-RP systems eventually encounter the same problems:

- the model decides what the player thinks or does;
- health, resources, equipment, and abilities drift away from the story;
- powerful NPCs become passive or forget their own plans;
- lore exists only around the current scene;
- long campaigns fill the context window with raw transcript;
- one malformed JSON response can interrupt the entire story.

Letopis addresses these problems with explicit player-agency rules, a persistent simulation model, layered memory, strict contracts, targeted repair, and a world-specific interface generated from real campaign data.

## Core features

### Living roleplay

- The player controls the protagonist's decisions, words, feelings, and commitments.
- NPCs have independent goals, knowledge, misconceptions, relationships, resources, tactics, and countermeasures.
- Strong opponents use actual abilities, preparation, information, terrain, allies, and retreat conditions instead of artificial difficulty labels.
- Factions, settlements, corporations, cultures, religions, countries, and distant conflicts can continue developing outside the current scene.
- A universal event director can seed, foreshadow, manifest, resolve, or cancel unusual events while preserving causality and player agency.

### Persistent typed state

- Health, resources, statistics, conditions, currency, inventory, equipment, abilities, techniques, artifacts, relationships, party membership, quests, reputation, and time.
- Deep ability profiles with activation rules, capabilities, techniques, effects, costs, limitations, counters, synergies, examples, evolution paths, and history.
- Deep artifact profiles with rarity evidence, components, powers, combined effects, attunement, bond, awakening paths, drawbacks, counters, and provenance.
- Atomic undo restores both the prose and every state mutation from the same turn.
- Manual and AI-assisted campaign editing use the same validated state engine.

### Long-running worlds

- Recent scenes remain verbatim while older material is compressed into scene, chapter, and era archives.
- Persistent facts, episodic memories, lorebook entries, imported canon documents, world processes, and event signatures are retrieved separately.
- Hidden information stays available to simulation while the UI reveals only what the protagonist has actually learned.
- Legendary figures have real histories, transmitted myths, legacies, current status, encounter conditions, and mechanically supported power.

### Resilient world generation

World generation is split into six full-depth stages:

1. world foundation, player, abilities, and starting inventory;
2. geography, civilizations, factions, laws, and mechanics;
3. living NPCs, social links, strategies, and centers of power;
4. legendarium, historical eras, exceptional figures, and lore;
5. autonomous processes, narrative threads, mysteries, and opening scene;
6. adaptive interface bound to the facts that already exist.

Every stage receives the established facts from earlier stages. The assembled world then passes one strict cross-entity validator and a holistic quality review. If a binding or reference is wrong, Letopis regenerates only the section that owns the error instead of asking the provider to recreate the entire world. Cloudflare `520–526` failures, including `524`, retry only the active stage.

### Adaptive UI and accounts

- Six stable campaign tabs whose labels and supporting modules can adapt to the current world.
- Desktop, tablet, and phone layouts with collapsible side panels and readable long-form prose.
- Email/password registration, secure sessions, device revocation, password management, and optional Google OAuth.
- IndexedDB works as a local/offline copy; authenticated campaigns synchronize through SQLite across browsers and devices.
- Owner/admin panel for users, sessions, campaigns, moderation, and audit history.
- A movable “Ask about the world” panel answers questions without changing campaign state.

## How Codex & GPT-5.6 were used

This project was developed through an extended human-directed collaboration with **OpenAI Codex and GPT-5.6**. They were used as an engineering partner, not merely as a one-shot code generator.

### Architecture and implementation

Codex inspected and modified the real repository, traced failures across React, Express, SQLite, Zod, IndexedDB, and the model orchestration layer, and implemented changes directly in the working application. GPT-5.6 was used for system-level reasoning about state ownership, causal consistency, long-context memory, player agency, and failure recovery.

Concrete examples include:

- designing the semantic event-director contract and mapping event requirements to persistent state;
- separating model-authored prose from authoritative game mutations;
- building multi-stage world generation without reducing the depth of NPCs, abilities, artifacts, or lore;
- introducing section-owned repair so malformed model output never forces a full-world rewrite;
- modeling intelligent enemies, hidden knowledge, autonomous factions, legendary figures, and gradual information disclosure;
- implementing registration, synchronization, admin tooling, responsive UI, and production deployment;
- diagnosing live DeepSeek schema failures and converting them into reproducible validators and regression tests.

### Evaluation and reliability

Codex and GPT-5.6 were also used to turn reported failures into tests rather than patching individual examples. The current suite covers:

- malformed provider JSON and Cloudflare `524` recovery;
- cross-world references and adaptive-interface bindings;
- NPC disclosure and player-agency protection;
- inventory, rarity, abilities, artifacts, and synchronized progression;
- event-director compliance and persistent consequences;
- multi-stage generation and targeted section repair;
- long-story rendering, account flows, storage, and responsive components.

The repository currently passes **272 automated tests**, strict TypeScript checking, ESLint, and a production Vite build.

### Human direction

The product vision, RP requirements, acceptance decisions, and live-world testing came from the project owner. Codex and GPT-5.6 converted that direction into architecture, implementation, validation, tests, documentation, and deployment. They are development tools for this repository; the runtime remains provider-agnostic and does not require GPT-5.6.

## Architecture

```mermaid
flowchart LR
    P["Player input"] --> C["Context selection"]
    C --> S["Off-screen simulation"]
    S --> E["Event director"]
    E --> D["Turn director"]
    D --> V["Zod + domain validation"]
    V --> N["Narrator candidates"]
    N --> Q["Continuity + agency + consequence audits"]
    Q --> A["Atomic state commit"]
    A --> M["Memory, timeline, IndexedDB, cloud sync"]
    V -. "targeted repair" .-> D
```

The key invariant is simple: **a statement in the narrative is not authoritative state by itself**. A change is persisted only through a validated mutation.

For a deeper technical breakdown, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Technology

- React 19 and TypeScript
- Vite
- Express 5
- Zod
- SQLite via `better-sqlite3`
- IndexedDB via `idb`
- OpenAI-compatible provider adapter
- Vitest and Testing Library
- Nginx and systemd in production

## Quick start

Requirements: **Node.js 20+**.

```bash
git clone https://github.com/WEnDeRmEnW/ai-rp.git
cd ai-rp
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API runs on `127.0.0.1:8787`.

### Production build

```bash
npm run build
npm start
```

The production client and API are then served from [http://127.0.0.1:8787](http://127.0.0.1:8787).

### Verification

```bash
npm test
npm run lint
npm run build
```

## Configuration

Copy `.env.example` to `.env` for optional server configuration:

```dotenv
PORT=8787
LETOPIS_DATA_DIR=.data
PUBLIC_URL=http://127.0.0.1:8787

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_BOOTSTRAP_TOKEN=
```

Google OAuth is optional. The callback URL is:

```text
<PUBLIC_URL>/api/auth/google/callback
```

## Model providers

Letopis supports:

- OpenAI;
- OpenRouter;
- Ollama and Ollama Cloud;
- DeepSeek through an OpenAI-compatible endpoint;
- custom OpenAI-compatible providers;
- a built-in demo narrator that requires no API key.

An API key entered in the interface is kept in the current tab's `sessionStorage`. It is not written to IndexedDB, synchronized campaigns, exports, SQLite, or this repository.

## Project structure

```text
shared/          shared campaign types, retrieval, rarity, and event logic
server/          Express API, auth, SQLite, prompts, schemas, and orchestration
src/components/  React UI and responsive campaign panels
src/lib/         state engine, storage, API adapters, formatting, and utilities
src/state/       application and authentication state
docs/            architecture notes
```

## Current limitations

- Canon accuracy still depends on the selected model and the user's supplied canon material.
- The local retrieval layer is deterministic and lexical; it intentionally avoids requiring a separate embedding provider.
- Google login requires the repository owner to configure OAuth credentials.
- The public deployment is an evolving project rather than a finished commercial service.

## Security note

Do not commit `.env`, database files, provider keys, OAuth secrets, or admin bootstrap tokens. The supplied `.gitignore` excludes local environment files, build output, logs, coverage, and the `.data` directory.
