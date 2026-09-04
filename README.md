# The Last Signal

**The Last Signal** is a cooperative escape room for one human and one browser agent. The human interprets the environment and controls physical authorization points while the agent operates the station through dynamically discovered [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools.

The project was built for [The WebMCP Challenge](https://webmcp.devpost.com/).

## The experience

An evacuation shuttle leaves the failing Asteria relay in twelve minutes. Together, the human and agent must:

1. Safely restore life-support and communications power.
2. Analyze three transmissions and reconstruct their message.
3. Recover three-factor authorization and open the command vault.
4. Release the airlock through a synchronized human override and agent command.

The final action cannot be completed by the agent alone: a human must activate a ten-second physical override window before the `engage_emergency_release` tool can succeed.

## Why WebMCP

This is not a chatbot and it does not run a separate MCP server. The page registers structured tools directly through `document.modelContext.registerTool()`. Every human interaction and agent tool call uses the same command layer and updates the same visible game state.

The registration layer follows the WebMCP imperative API directly:

```js
await document.modelContext.registerTool({
  name: "inspect_power_grid",
  description: "Inspect power relays, capacity, faults, and the station maintenance sequence before routing power.",
  inputSchema: { type: "object", properties: {} },
  execute: async () => JSON.stringify(inspectPowerGrid("agent")),
  annotations: { readOnlyHint: true },
});
```

Available tools change as the station is restored:

- Base and power: `get_mission_status`, `inspect_station_room`, `request_mission_hint`, `inspect_power_grid`, `test_power_configuration`, `route_power`, `reset_power_breaker`
- Communications: `scan_signal_frequencies`, `tune_signal_receiver`, `analyze_tuned_signal`, `assemble_transmission`
- Command vault: `search_station_records`, `inspect_inventory_item`, `combine_inventory_items`, `submit_vault_authorization`
- Evacuation: `engage_emergency_release`

Tools are registered and unregistered with `AbortController` as game state changes. Tool inputs use constrained JSON Schemas and tool responses return structured, recoverable results.

## Run locally

The project has no dependencies or build step.

```bash
python3 -m http.server 4173
```

Then visit [http://localhost:4173](http://localhost:4173).

WebMCP currently requires a supporting browser. In Chrome, enable `chrome://flags/#enable-webmcp-testing` and relaunch, or open the deployed page in ChatGPT's in-app browser. Without WebMCP, the game provides a manual fallback so the entire scenario remains reviewable.

## Suggested agent prompt

> Help me inspect this station, solve each system, and escape. Explain important findings, but ask before entering final authorization codes.

## Manual walkthrough

<details>
<summary>Solution (spoilers)</summary>

1. Route power to `life_support` and `communications`.
2. Analyze 142.7, 311.9, and 487.3 MHz.
3. Assemble `ORION → LYRA → DRACO` to recover command code `731`.
4. Search for the station commander to find call sign `NIGHTJAR`.
5. Combine the cracked access card and maintenance pin to recover `TOKEN-04`.
6. Submit `731`, `NIGHTJAR`, and `TOKEN-04` to open the vault.
7. Activate the human override and call `engage_emergency_release` with `ERK-7A` and `evacuation_shuttle` within ten seconds.

</details>

## Architecture

```text
Human controls ─┐
                ├─> validated game commands ─> shared state ─> visible UI + mission log
WebMCP tools ───┘
```

- `index.html` contains the semantic application shell.
- `styles.css` provides the responsive station interface and state transitions.
- `app.js` contains scenario data, the state machine, command handlers, rendering, and WebMCP registration.
- `vercel.json` adds origin isolation and WebMCP permissions headers when deployed on Vercel.

## Deploy

The repository can be deployed as a static site on Vercel, Netlify, Cloudflare Pages, or any equivalent host. No environment variables or credentials are required.

For Vercel, import the repository and deploy with the default static-project settings. `vercel.json` supplies the required headers.

## License

[MIT](./LICENSE)
