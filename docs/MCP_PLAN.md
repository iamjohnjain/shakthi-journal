# MCP Plan

## What MCP Is (In This Context)

MCP (Model Context Protocol) is how Claude connects to external tools and data sources. An MCP server lets Claude read data, run queries, or take actions on your behalf inside a conversation.

For a health dashboard, MCP becomes useful when you want Claude to:
- Read your actual health data and give personalized coaching advice
- Query your workout history before recommending a training plan
- Analyze trends in your real metrics over time

---

## Currently Configured MCP Servers

### claude-code-docs
- **URL:** https://code.claude.com/docs/mcp
- **Transport:** HTTP
- **Purpose:** Gives Claude access to Claude Code documentation. Used for development assistance, not health data.
- **Health data access:** None
- **Status:** Active (added 2026-06-26)

---

## MCP Strategy for Health Dashboard

### V1 — No Health MCP Needed
In V1, Claude can discuss your health goals and plans using the context in your system prompt (your stats, goals, nutrition targets). No live data access is needed for general coaching conversations.

### V2 — Local MCP Server (When AI Coaching Gets Real)
Once you have real data in the dashboard, you can run a local MCP server that:
- Reads your local health data store (JSON/SQLite)
- Exposes endpoints Claude can query (e.g., "get last 7 days of sleep", "get today's macros")
- Never sends data to any cloud service — runs entirely on your Mac

This would be a small Node.js or Python server you run locally. Claude connects to it only during active conversations.

**Example future MCP tools this server would expose:**
- `get_today_summary` → returns today's calories, protein, sleep, steps, recovery
- `get_weight_trend` → returns weight over N days
- `get_workout_history` → returns recent workouts
- `get_sleep_history` → returns sleep data over N days

### V3 — Strava MCP (Optional)
Once Strava OAuth is set up, you could expose Strava activity data through the same local MCP server rather than building a separate connection.

---

## MCP Servers to Avoid

**Do not install random unofficial MCP servers for health data.**

The risks are:
1. An unofficial MCP server has full read access to anything you grant it
2. Health data (sleep, HRV, body composition, location via GPS routes) is extremely sensitive
3. Unofficial servers may log, transmit, or sell your data
4. There is no vetting process for MCP servers — anyone can publish one

Before adding any new MCP server to this project, verify:
- Who built it and why
- Whether it sends data anywhere
- Whether the source code is public and reviewable

The only safe pattern for health data MCP is a server you build yourself, running locally.

---

## MCP Roadmap

| Phase | MCP Action                              | When              |
|-------|-----------------------------------------|-------------------|
| V1    | No new health MCP servers               | Now               |
| V2    | Build local MCP server for health data  | After real data   |
| V3    | Extend local server with Strava data    | After Strava API  |
