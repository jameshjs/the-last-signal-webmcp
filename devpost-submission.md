# The Last Signal — Devpost Submission Draft

> ⏳ This is a preparation draft. Nothing in this file has been submitted to Devpost.

## Project title

The Last Signal

## Tagline

A cooperative escape room where one human and one browser agent can only survive by operating the same world together.

## Links

- Live application: https://webmcp-lemon.vercel.app
- Public repository: **TODO — publish to GitHub**
- Demo video: **TODO — upload a public YouTube video under three minutes**

## Submission description

### Inspiration

Most agent-enabled websites treat the agent as an invisible automation layer: it clicks through an interface while the human waits for a result. We wanted to explore something more native to the web—an experience intentionally designed around the different strengths of a person and an agent.

The Last Signal is a cooperative escape room for one human and one browser agent. The player is trapped aboard a failing orbital communications station with twelve minutes to restore its systems and release an evacuation airlock. The human interprets the environment, makes judgment calls, and controls physical authorization points. The agent inspects and operates station machinery using structured WebMCP tools.

### Why this use case is a strong fit for WebMCP

Escape rooms are built from stateful objects, constrained actions, hidden dependencies, and consequences. Those concepts map naturally to WebMCP tools. Instead of scraping a visual control panel or guessing which DOM element represents a relay, the agent can discover an `inspect_power_grid` tool, read its JSON Schema, test a proposed configuration, and then call `route_power` with validated relay identifiers.

The page's available capabilities change with the state of the game. Restoring power reveals communications tools. Decoding the transmission reveals vault tools. Opening the vault reveals the final evacuation tool. This makes WebMCP discovery part of the game mechanic rather than a thin API wrapper around buttons.

The final puzzle demonstrates the human-in-the-loop model directly: `engage_emergency_release` cannot succeed until the human activates a physical override in the visible interface. That override lasts ten seconds and is checked against live page state. The agent has structured actuation, but the person retains meaningful control.

### How it creates a better user experience

Every agent action updates the same interface the player is watching. When the agent routes power, panels illuminate. When it analyzes a frequency, the decoded fragment appears in the receiver. When it combines inventory items, the new authorization token appears in the player's inventory. A shared chronological mission log attributes every action to the human, agent, or station.

This gives the player situational awareness and makes agent behavior legible. The agent receives precise, recoverable error messages instead of silently failing against a visual interface. The player can understand what happened, why it happened, and what capabilities became available next.

The experience also progressively enhances. In a WebMCP-capable client, the agent operates structured tools. In an ordinary browser, the complete game remains playable through equivalent manual controls, making the project easy to evaluate and accessible outside experimental environments.

### What people and agents can now do together

The Last Signal creates a shared interactive world rather than dividing the experience into "chat" and "website." The human and agent can inspect the same evidence, manipulate the same state, recover from each other's mistakes, and perform a synchronized final action.

Previously, recreating this experience would require brittle screen-coordinate automation, custom browser integrations, or a separate MCP server disconnected from the current visual page. The agent would need to infer the meaning of relays, signal fragments, inventory objects, and locked controls from presentation markup. WebMCP lets the website declare those capabilities and their valid inputs directly while keeping execution visible in the page.

Neither participant can deliver the intended finale alone. The agent needs the human's time-limited physical authorization; the human benefits from the agent's structured inspection and rapid operation of linked systems. That complementary relationship is the core of the project.

### How WebMCP was implemented

The application registers 16 imperative WebMCP tools with `document.modelContext.registerTool()`. Every tool has a focused description, a constrained JSON Schema, structured success and error results, and annotations identifying read-only versus mutating behavior.

Tools and human controls call the same command layer. Each command validates preconditions, updates the central game state, records an attributed timeline entry, rerenders the visible room, and returns structured context to the agent. This prevents the manual and agent experiences from diverging.

Tool lifetimes are state-dependent. Each registration receives an `AbortSignal`; when the mission resets or a capability is not yet available, its controller is aborted. Communications, vault, and evacuation tools are registered only after their prerequisite systems have been unlocked. The deployed site also sends `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)` headers.

### Key features

- Four connected puzzles: power routing, signal reconstruction, three-factor vault authorization, and cooperative airlock release
- Sixteen structured WebMCP tools that unlock dynamically
- Shared human/agent game state and attributed activity log
- Human authorization boundary with a ten-second release window
- Structured, recoverable tool errors and safe configuration testing
- Twelve-minute mission timer, penalties, progressive hints, inventory, scoring, and reset flow
- Dependency-free static deployment with a full manual fallback

### How Codex was used

Codex helped turn the initial concept into a scoped game loop, implement the complete interface and shared command architecture, register the WebMCP tools, test the four-puzzle flow in a browser, diagnose interaction issues, verify deployment headers, and deploy the production build to Vercel.

## Built with

- WebMCP Imperative API
- JavaScript
- HTML5
- CSS3
- Vercel
- Codex

## Testing instructions for judges

1. Open https://webmcp-lemon.vercel.app in ChatGPT's WebMCP-capable in-app browser or Chrome with WebMCP testing enabled.
2. Start the mission.
3. Ask the agent: "Inspect the current station using its WebMCP tools. Solve each system step by step. Explain important findings, but ask before submitting the vault authorization and let me activate the final manual override."
4. Watch the visible room and shared mission log update as tools execute.
5. When the final objective appears, click **Activate manual override**.
6. Ask the agent to release the evacuation airlock before the ten-second window closes.

No account or credentials are required. If WebMCP is unavailable, the footer identifies manual mode and the complete game remains playable with on-screen controls.

## Official form answers

- **Submitter Type:** Individual
- **Country:** Canada
- **App Status:** New
- **Live URL:** https://webmcp-lemon.vercel.app
- **Testing instructions:** Use the instructions above; no credentials required.
- **Public repo URL:** TODO
- **Agent/client tested:** TODO — confirm after testing in a WebMCP-capable ChatGPT browser or Chrome Model Context Tool Inspector.
- **AI tools leveraged:** OpenAI Codex for product planning, implementation, debugging, browser testing, documentation, and deployment assistance.
- **Level of learning:** Significant
- **AI value for career:** Yes

## Demo video plan — target 2:35

### 0:00–0:15 — Hook

**Visual:** The dark station and twelve-minute timer.

**Narration:** "This is The Last Signal, a cooperative escape room built for one human and one browser agent. We have twelve minutes to restore a failing orbital station and reach the evacuation shuttle."

### 0:15–0:32 — Why WebMCP

**Visual:** Show the WebMCP connection indicator and registered tool inspector.

**Narration:** "The agent does not scrape the interface or guess which buttons to click. The page exposes structured WebMCP tools whose availability changes as we restore each system. Every tool call updates the same visible world I am playing in."

### 0:32–1:00 — Power puzzle

**Visual:** Enter the suggested prompt. Show the agent inspect the room, inspect the grid, test a configuration, and route power. Lights activate and the timeline updates.

**Narration:** "The agent discovers the relay constraints, tests a safe configuration, and restores life support and communications. That state transition registers a new set of signal tools."

### 1:00–1:30 — Signal puzzle

**Visual:** Agent scans frequencies, analyzes three signals, and assembles ORION, LYRA, DRACO. Show COMMAND CODE 731.

**Narration:** "The agent analyzes three transmissions with constrained frequency inputs. We use the room's constellation clue to reconstruct the command code, which unlocks the vault capabilities."

### 1:30–1:58 — Vault puzzle

**Visual:** Search records, inspect/combine inventory, show NIGHTJAR and TOKEN-04, then ask before authorization.

**Narration:** "We recover three authorization factors from different systems. The agent links station records with physical inventory, then pauses before submitting the final vault credentials."

### 1:58–2:25 — Cooperative finale

**Visual:** Human clicks the override. Agent calls `engage_emergency_release`. Show victory screen.

**Narration:** "The final action requires both of us. I activate a physical override, opening a ten-second authorization window. Only then can the agent use the recovered key to release the airlock. Neither participant delivers the intended experience alone."

### 2:25–2:35 — Close

**Visual:** Victory screen, then briefly show the source registration code.

**Narration:** "The Last Signal demonstrates WebMCP as a foundation for shared, visible human-agent experiences—not just invisible automation."

## Screenshot shot list

1. Intro overlay with the suggested agent prompt
2. Full station dashboard under emergency lighting
3. Restored communications console with decoded fragments
4. Shared mission log showing mixed human and agent actions
5. Manual override active with the agent-release window
6. Victory screen with action counts

## Readiness

- [x] Working public deployment
- [x] Complete source and setup instructions
- [x] MIT license
- [x] Imperative `document.modelContext.registerTool()` implementation
- [x] Browser-tested manual game flow
- [ ] Public GitHub repository
- [ ] Confirm WebMCP runtime test client
- [ ] Public YouTube demo under three minutes with audio
- [ ] Devpost project entry and final submission

