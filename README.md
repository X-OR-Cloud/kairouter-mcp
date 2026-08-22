# kairouter-mcp

MCP server exposing KaiRouter's video generation API — BytePlus Seedance
family (Seedance 2.0, 2.0 Fast, 2.0 Mini, 1.5 Pro, 1.0 Pro, ...) and any
other video model active on KaiRouter — as tools any MCP-compatible agent
harness (Claude Code, Codex, Antigravity, ...) can call.

This is a standalone repo — it does not contain any of KaiRouter's backend
source, only a thin client for its public/user-scoped HTTP API. Not yet
published to npm — run it from a local build for now (see below).

## Tools

| Tool | Description |
|---|---|
| `list_video_models` | List currently active video models on KaiRouter, with pricing and live provider health. No API key required. |
| `generate_video` | Start an async video generation job (text-to-video or image-to-video). Returns a job id immediately — does not block until the video is ready. Spends real credits. |
| `check_video_status` | Poll a job by id. `status` is `queued` \| `processing` \| `succeeded` \| `failed`; `video_url` is set once `succeeded`. |
| `list_video_jobs` | List the caller's most recent jobs (up to 50), most recent first. |

`generate_video` is async by design — BytePlus video generation can take
tens of seconds to a few minutes. The agent is expected to call
`generate_video` once, then poll `check_video_status` every few seconds
until the job finishes.

## Setup

```bash
git clone https://github.com/X-OR-Cloud/kairouter-mcp.git
cd kairouter-mcp
npm install
npm run build
```

This produces `dist/index.js`. You'll need a KaiRouter API key —
create one at https://kairouter.com/dashboard/api-keys.

### Claude Code

```bash
claude mcp add kairouter -e KAIROUTER_API_KEY=sk-xor-your-key-here -- node /absolute/path/to/kairouter-mcp/dist/index.js
```

Or add directly to `.mcp.json` (project) / `~/.claude.json` (user):

```json
{
  "mcpServers": {
    "kairouter": {
      "command": "node",
      "args": ["/absolute/path/to/kairouter-mcp/dist/index.js"],
      "env": { "KAIROUTER_API_KEY": "sk-xor-your-key-here" }
    }
  }
}
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.kairouter]
command = "node"
args = ["/absolute/path/to/kairouter-mcp/dist/index.js"]
env = { KAIROUTER_API_KEY = "sk-xor-your-key-here" }
```

### Antigravity / other MCP-compatible harnesses

Most harnesses accept the same `mcpServers` JSON block shown above under
Claude Code — check the harness's own MCP settings for the exact config
file path/UI, since this varies and wasn't verified here for Antigravity
specifically.

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `KAIROUTER_API_KEY` | For `generate_video`, `check_video_status`, `list_video_jobs` | — | From https://kairouter.com/dashboard/api-keys. Not needed for `list_video_models`, which is a public endpoint. |
| `KAIROUTER_API_URL` | No | `https://kairouter.com` | Override to point at a staging/local KaiRouter instance. |

## Development

```bash
npm run dev    # tsc --watch
npm start      # run the built server directly over stdio (for manual testing with an MCP client)
```
