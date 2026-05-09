<p align="center">
  <img src="https://github.com/KrisbelGV/scarlets_basement-website/blob/main/assets/logo.png" alt="Scarlet's Basement Proxy Logo" width="200">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.x-brightgreen" alt="Node version">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License MIT">
  <img src="https://img.shields.io/badge/deploy-Vercel-black" alt="Deploy Vercel">
</p>

# Scarlet's Basement Proxy

Scratch public API proxy server (MIT). Provides extended user information and additional filters on basic functions, such as searching for projects and studios, plus exclusive indexing queries and a custom feed from your qualified followers.

Created by [KrisbelGV](https://github.com/KrisbelGV) as part of the educational and learning project ["Scarlet's Basement"](https://krisbelgv.github.io/scarlet-basement-website/about.html) available on the [Scarlet's Basement Website](https://krisbelgv.github.io/scarlet-basement-website/).

## Features
- 🔍 **Extended search** - Search projects and studios with additional filters (mode, profiles, discard terms)
- 👤 **User statistics** - Get detailed summaries for any Scratch user
- 📂 **Studio finder** - Locate studios by project ID and tags
- 📊 **Indexing status** - Check speculative indexing status of a project
- 👥 **Custom feed** - Curated following feed from qualified followers
- ⚡ **Rate limiting & circuit breaker** - Protects Scratch API from overuse

## Tech Stack
| Category | Technology |
|----------|------------|
| Runtime | Node.js |
| Framework | Express |
| Cache | Upstash Redis |
| Deploy | Vercel |
| API Source | Scratch Public API |

## Table of contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Structure](#structure)
  - [Directories](#directories)
  - [Responsibilities by layer](#responsibilities-by-layer)
- [Design notes](#design-notes)
- [Endpoints](#endpoints)
- [License](#license)
- [How to contribute?](#how-to-contribute)

## Installation
1. Clone this repository

    ```bash
    git clone https://github.com/KrisbelGV/scarlets_basement-proxy.git
    cd scarlets_basement-proxy
    ```

2. Ensure you have Node.js 18 or higher

    ```bash
    node --version  # Should be v18.x or higher
    ```
  
3. Install the project dependencies

    ```bash
    npm install
    ```

4. Create a `.env` file in the project root

    ```env
    NODE_ENV=development
    PORT=300
    ```

5. Run the development server

    ```bash
    npm run dev
    ```

## Structure

### Directories
```
scarlets-basement-proxy/
│
├── api/
│   └── index.js
│
├── src/
│   ├── controllers/
│   │   ├── aNewView.js
│   │   ├── findAStudio.js
│   │   ├── isItIndex.js
│   │   ├── search.js
│   │   └── userData.js
│   │
│   ├── middleware/
│   │   ├── doorman.js
│   │   ├── errorHandler.js
│   │   └── validator.js
│   │
│   ├── routes/
│   │   └── proxy.js
│   │
│   ├── services/
│   │   ├── filterService.js
│   │   └── proxyService.js
│   │
│   └── utils/
│       ├── catchAsync.js
│       ├── createAbortController.js
│       └── upstash.js
│
├── package.json
├── package-lock.json
└── vercel.json
```

### Responsibilities by layer
| Layer | Archive | Function |
|--------------|--------------|--------------|
| Entry point | api/index.js | Configure Express, CORS, set up routes |
| Routes | src/routes/proxy.js | Define endpoints and middleware chain |
| Middleware | src/middleware/doorman.js | Rate limiting, processing blocking, and circuit breaker |
| Middleware | src/middleware/validator.js | Input validation and sanitization |
| Middleware | src/middleware/errorHandler.js | Translates errors to HTTP responses |
| Controllers | src/controllers/*.js | They orchestrate the business logic |
| Services | src/services/filterService.js | Search, filter, statistics count |
| Services | src/services/proxyService.js | HTTPS client to Scratch |
| Utilities | src/utils/upstash.js | Lua scripts for Redis |
| Utilities | src/utils/catchAsync.js | Try/catch for async/await |
| Utilities | src/utils/createAbortController.js | Timeout for long operations |

## Design notes

Key technical decisions—and why certain approaches were rejected.

### ❌ Client-side filtering (discarded)
Using a third-party proxy to bypass CORS and filter on the browser was rejected due to **privacy concerns**. A browser-based solution would expose user requests and filtering patterns to external servers, whereas a server-side proxy keeps all processing under the project's control.

### ❌ Request queue system (discarded)
A queuing mechanism was prototyped to handle concurrent requests, but it produced an **unacceptable error rate** due to network latency and inter-service communication issues. It degraded user experience and consumed unnecessary resources, so it was removed.

### ❌ Resumable pagination (discarded)
The idea of adding mirrored endpoints to resume pagination after timeout limits was considered but **rejected to preserve resources** for diverse, non-exhaustive queries. The current five endpoints are sufficient, though this could be reconsidered based on user feedback.

### ✅ Current approach
The proxy focuses on **lightweight, stateless filtering** with rate limiting and a circuit breaker to protect the Scratch API. All decisions prioritize reliability, privacy, and fair access for all users.

> 💡 **Open to collaboration** – We remain open to working with external providers to reduce Scratch API load and develop new features, provided privacy standards are met.

## Endpoints

All endpoints return a boolean `abort` field:
- `false` — Complete result from Scratch API
- `true` — Incomplete result (processing timeout or partial data)

> **Access policy:** This API implements CORS restrictions and is only accessible from domains associated with [KrisbelGV's GitHub repositories](https://github.com/KrisbelGV) and the official [Scarlet's Basement Website](https://krisbelgv.github.io/scarlet-basement-website/). You may test the API for educational or development purposes (console, browser, curl, Postman, etc.), but use in external projects is not open for discussion. Resources are limited and must be reserved to guarantee the proper functioning of this service.

### `GET /api/userdata/:username`
Returns a summary of statistics for a given user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `:username` | path | ✅ | Scratch username |

### `GET /api/search`
General search or profile-filtered search.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | query | ✅ | Search terms |
| `mode` | query | ❌ | Results order. Only `trending` accepted; `popular` is default |
| `username` | query | ❌ | Specifies a user for the query |
| `profile` | query | ❌ | Uses projects of specified profile(s) instead of general search |
| `discard` | query | ❌ | Terms to exclude from results |

### `GET /api/findastudio/:projectid`
Returns studios associated with the given project ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `:projectid` | path | ✅ | Scratch project ID |
| `tag` | query | ❌ | Filter by tag (without `#` symbol) |

### `GET /api/isitindex/:projectid`
Returns project statistics and speculative indexing status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `:projectid` | path | ✅ | Scratch project ID |

### `GET /api/anewview/:username`
Returns a custom following feed for the given user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `:username` | path | ✅ | Scratch username |

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). See the [LICENSE](./LICENSE) file in this repository for the full terms.

## How to contribute?

Contributions to the codebase are welcome! As an open-source educational project, we appreciate improvements, bug fixes, and documentation enhancements.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/feature`)
3. Commit your changes (`git commit -m 'Add feature'`)
4. Push to the branch (`git push origin feat/feature`)
5. Open a Pull Request
6. **After your PR is reviewed and merged by the maintainer, it will be automatically deployed**

> **Note for contributors:** Deployments are handled via GitHub Actions. All changes must go through a Pull Request. Direct pushes to `main` are protected and will be rejected.

For detailed tracking of bug fixes or updates, follow our news thread in the Scratch discussion forum.