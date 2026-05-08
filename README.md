<p align="center">
  <img src="logo.png" alt="Scarlet's Basement Proxy Logo" width="200">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.x-brightgreen" alt="Node version">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License MIT">
  <img src="https://img.shields.io/badge/deploy-Vercel-black" alt="Deploy Vercel">
</p>

# Scarlet's Basement Proxy

Scratch public API proxy server (MIT). Provides extended user information and additional filters on basic functions, such as searching for projects and studios, plus exclusive indexing queries and a custom feed from your qualified followers.

Created by [KrisbelGV](https://github.com/KrisbelGV) as part of the educational and learning project ["Scarlet's Basement"](https://krisbelgv.github.io/scarlet-basement-website/) available on the [Scarlet's Basement Website](https://krisbelgv.github.io/scarlet-basement-website/about.html).

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
- [Transparency](#transparency)
- [License](#license)
- [How to contribute?](#how-to-contribute)

## Installation
1. Clone this repository

    ```bash
    git clone https://github.com/KrisbelGV/scarlets_basement-proxy.git
    cd scarlets_basement-proxy
    ```

2. Install the project dependencies

    ```bash
    npm install
    ```

3. Create a `.env` file in the project root

    ```env
    NODE_ENV=development
    PORT=300
    ```

4. Run the development server

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
The implementation of a browser-based filtering service using a third-party proxy to bypass CORS was analyzed but ultimately discarded due to privacy concerns and the need to control information flow. However, we remain open to collaborating with external providers to improve the user experience, reduce the workload on the Scratch API, and develop new features beyond the initial five primary functions.

Similarly, we thoroughly explored developing a request queuing system, considering current requirements and system limitations (no concurrent requests), which had reached a considerable point. However, its implementation was abandoned due to an unacceptable error rate caused by minor network latency and inter-service communication issues, which negatively impacted the user experience and unnecessarily consumed resources.

We also considered adding a mirrored endpoint or other functionality to the existing ones, which would allow pagination to resume where the processing time limit had triggered it. However, similar to the previous proposals, it was rejected in order to preserve resources for diverse and non-exhaustive inquiries, considering the current scope more than sufficient. Despite this, it could be reconsidered at the request of users if they find it useful.

## Endpoints

For testing from the console, browser, and various tools. It is not accessible from sites not belonging to my GitHub account, [KrisbelGV](https://github.com/KrisbelGV), nor is its use intended through any means other than the dedicated static web client. However, you are free to use your daily API requests as you prefer, as long as this does not interfere with the natural and timely access of other users.

> **Note:** All endpoints return a boolean `abort` field indicating whether the result is incomplete (`true`) or the official complete result (`false`).

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

This project is licensed under the MIT License without warranty or liability for its misuse. A copy is available in this repository, and further information, along with the original, can be found on its website.

## How to contribute?
As an open-source educational project, we are more than happy to receive contributions/corrections.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/feature`)
3. Commit your changes (`git commit -m 'Add feature'`)
4. Push to the branch (`git push origin feat/feature`)
5. Open a Pull Request

For more detailed tracking of bug fixes or updates and the motivations behind them, we recommend following our news thread in the Scratch discussion forum.