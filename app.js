const RELAYS = {
  life_support: { label: "Life support", draw: 2, detail: "Atmosphere, emergency lighting" },
  communications: { label: "Communications", draw: 3, detail: "Receiver and signal array" },
  door_controls: { label: "Door controls", draw: 4, detail: "Airlock motors — high draw" },
  auxiliary: { label: "Auxiliary bus", draw: 2, detail: "Damaged; unstable with door controls" },
};

const SIGNALS = {
  "142.7": { constellation: "ORION", fragment: "COMMAND", bearing: "031°" },
  "311.9": { constellation: "LYRA", fragment: "CODE", bearing: "118°" },
  "487.3": { constellation: "DRACO", fragment: "731", bearing: "274°" },
};

const OBJECTIVES = {
  power: ["01", "Restore station power", "Bring life support and communications online without overloading the grid."],
  signal: ["02", "Reconstruct the last signal", "Analyze all three transmissions and arrange them using the station's constellation order."],
  vault: ["03", "Open the command vault", "Recover the command code, commander call sign, and physical authorization token."],
  escape: ["04", "Release the evacuation airlock", "Activate the manual override, then have your agent send the emergency release command."],
  complete: ["✓", "Evacuation confirmed", "The Asteria relay is stable and the shuttle airlock is open."],
};

const HINTS = {
  power: [
    "The maintenance placard describes the order of the station's essential systems.",
    "You need the systems that let the station wake and then call home.",
    "Route power to Life Support and Communications only."],
  signal: [
    "Each frequency is associated with a constellation and a word fragment.",
    "The constellation sketch orders the fragments: Orion, Lyra, then Draco.",
    "Analyze 142.7, 311.9, and 487.3 MHz, then assemble ORION → LYRA → DRACO."],
  vault: [
    "The authorization has three parts, gathered from different station systems.",
    "Search the crew records for the commander and examine your recovered hardware.",
    "Use 731, NIGHTJAR, and TOKEN-04."],
  escape: [
    "The warning inside the vault describes a two-party release procedure.",
    "The human must activate the manual override before the remote command is accepted.",
    "Activate the override, then call engage_emergency_release with ERK-7A and evacuation_shuttle."],
};

const initialState = () => ({
  started: false,
  phase: "power",
  remainingSeconds: 720,
  selectedRelays: [],
  powerOnline: false,
  overloaded: false,
  tunedFrequency: null,
  analyzedSignals: [],
  fragmentOrder: [],
  transmissionDecoded: false,
  commanderDiscovered: false,
  inventory: [],
  tokenCreated: false,
  vaultUnlocked: false,
  overrideExpiresAt: null,
  completed: false,
  hintsUsed: 0,
  hintDepth: { power: 0, signal: 0, vault: 0, escape: 0 },
  actions: { human: 0, agent: 0 },
  activity: [
    { actor: "system", message: "Distress protocol initiated. Primary systems are offline.", at: "T−12:00" },
  ],
  activePanel: "power",
});

let state = initialState();
let missionTimer = null;
let overrideTimer = null;
const toolControllers = new Map();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function missionTime() {
  const m = String(Math.floor(state.remainingSeconds / 60)).padStart(2, "0");
  const s = String(state.remainingSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function result(success, code, message, data = {}) {
  return { success, code, message, phase: state.phase, ...data };
}

function record(actor, message) {
  if (actor === "human" || actor === "agent") state.actions[actor] += 1;
  state.activity.unshift({ actor, message, at: `T−${missionTime()}` });
  state.activity = state.activity.slice(0, 40);
}

function notify(title, message, error = false) {
  const toast = document.createElement("div");
  toast.className = `toast${error ? " error" : ""}`;
  toast.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
  $("#toast-region").append(toast);
  setTimeout(() => toast.remove(), 4200);
}

function addInventory(id, name, description) {
  if (!state.inventory.some((item) => item.id === id)) state.inventory.push({ id, name, description });
}

function setPhase(phase) {
  if (state.phase === phase) return;
  state.phase = phase;
  const labels = { signal: "Communications tools discovered", vault: "Vault systems discovered", escape: "Evacuation controls discovered" };
  if (labels[phase]) record("system", labels[phase]);
  syncWebMCPTools();
}

function inspectPowerGrid(actor = "agent") {
  record(actor, "Inspected the power grid and relay load limits.");
  render();
  return result(true, "GRID_INSPECTED", "Grid capacity is 5 units. Door controls and the damaged auxiliary bus cannot safely run together.", {
    capacity: 5,
    relays: Object.entries(RELAYS).map(([id, relay]) => ({ id, ...relay })),
    maintenancePlacard: "WAKE → CALL → COMMAND → DEPART",
  });
}

function testPowerConfiguration(relays, actor = "agent") {
  const unique = [...new Set(relays || [])];
  if (unique.some((relay) => !RELAYS[relay])) return result(false, "UNKNOWN_RELAY", "One or more relay identifiers are invalid.");
  const load = unique.reduce((sum, relay) => sum + RELAYS[relay].draw, 0);
  const damagedPair = unique.includes("door_controls") && unique.includes("auxiliary");
  const safe = load <= 5 && !damagedPair;
  record(actor, `Tested power route: ${unique.map((id) => RELAYS[id].label).join(", ") || "none"}.`);
  render();
  return result(true, "CONFIGURATION_TESTED", safe ? "Configuration is electrically safe." : "Configuration would trip the main breaker.", {
    relays: unique,
    load,
    capacity: 5,
    safe,
    startsRequiredSystems: unique.includes("life_support") && unique.includes("communications"),
  });
}

function routePower(relays, actor = "agent") {
  if (state.powerOnline) return result(true, "ALREADY_ROUTED", "Required station systems are already online.");
  const unique = [...new Set(relays || [])];
  if (unique.some((relay) => !RELAYS[relay])) return result(false, "UNKNOWN_RELAY", "One or more relay identifiers are invalid.");
  const load = unique.reduce((sum, relay) => sum + RELAYS[relay].draw, 0);
  if (load > 5 || (unique.includes("door_controls") && unique.includes("auxiliary"))) {
    state.overloaded = true;
    state.selectedRelays = [];
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 15);
    record(actor, "Power route overloaded the grid. Main breaker tripped; 15 seconds lost.");
    notify("Breaker tripped", "The proposed route exceeded safe limits.", true);
    render();
    return result(false, "GRID_OVERLOAD", "The main breaker tripped. Reset it before attempting another route.", { load, capacity: 5 });
  }
  if (state.overloaded) return result(false, "BREAKER_TRIPPED", "Reset the main breaker before routing power.");
  state.selectedRelays = unique;
  if (!(unique.includes("life_support") && unique.includes("communications"))) {
    record(actor, "Applied a safe route, but essential systems remain offline.");
    render();
    return result(false, "ESSENTIAL_SYSTEM_MISSING", "The route is safe, but both Life Support and Communications are required.", { activeRelays: unique });
  }
  state.powerOnline = true;
  addInventory("cracked_access_card", "Cracked access card", "A command-level access card with a split casing.");
  record(actor, "Restored life support and communications. A cracked access card was released from the panel.");
  setPhase("signal");
  notify("Station power restored", "Communications are online. New tools are now available.");
  render();
  openPanel("signal");
  return result(true, "POWER_RESTORED", "Life support and communications are online. The signal array is available.", {
    activeRelays: unique,
    recoveredItem: "cracked_access_card",
    unlockedSystem: "communications",
  });
}

function resetBreaker(actor = "agent") {
  if (!state.overloaded) return result(true, "BREAKER_READY", "The main breaker is already ready.");
  state.overloaded = false;
  record(actor, "Reset the main power breaker.");
  render();
  return result(true, "BREAKER_RESET", "The power grid is ready for a new configuration.");
}

function scanFrequencies(actor = "agent") {
  if (!state.powerOnline) return locked("POWER_REQUIRED", "Restore communications power first.");
  record(actor, "Scanned the communications band and found three repeating signals.");
  render();
  return result(true, "SIGNALS_FOUND", "Three stable signals repeat across the band.", {
    frequenciesMHz: Object.keys(SIGNALS).map(Number),
    constellationSketchOrder: ["ORION", "LYRA", "DRACO"],
  });
}

function tuneReceiver(frequencyMHz, actor = "agent") {
  if (!state.powerOnline) return locked("POWER_REQUIRED", "Restore communications power first.");
  const key = Number(frequencyMHz).toFixed(1);
  if (!SIGNALS[key]) return result(false, "STATIC_ONLY", "No stable transmission exists at that frequency.", { frequencyMHz });
  state.tunedFrequency = key;
  record(actor, `Tuned the receiver to ${key} MHz.`);
  render();
  return result(true, "RECEIVER_TUNED", `Receiver locked to ${key} MHz. The signal can now be analyzed.`, { frequencyMHz: Number(key) });
}

function analyzeSignal(actor = "agent") {
  if (!state.tunedFrequency) return result(false, "RECEIVER_NOT_TUNED", "Tune the receiver to a stable frequency first.");
  const signal = SIGNALS[state.tunedFrequency];
  if (!state.analyzedSignals.includes(state.tunedFrequency)) state.analyzedSignals.push(state.tunedFrequency);
  record(actor, `Analyzed ${state.tunedFrequency} MHz: ${signal.constellation} / ${signal.fragment}.`);
  render();
  return result(true, "SIGNAL_ANALYZED", "Signal fragment decoded.", { frequencyMHz: Number(state.tunedFrequency), ...signal });
}

function assembleTransmission(constellationOrder, actor = "agent") {
  if (state.analyzedSignals.length < 3) return result(false, "FRAGMENTS_MISSING", "Analyze all three stable signals first.", { analyzed: state.analyzedSignals.length, required: 3 });
  const normalized = (constellationOrder || []).map((value) => String(value).toUpperCase());
  const expected = ["ORION", "LYRA", "DRACO"];
  if (normalized.join("|") !== expected.join("|")) {
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 10);
    record(actor, "Assembled the transmission in the wrong order; checksum failed.");
    render();
    return result(false, "CHECKSUM_FAILED", "Fragment order is incorrect. Use the constellation sketch; 10 seconds lost.", { provided: normalized });
  }
  state.fragmentOrder = normalized;
  state.transmissionDecoded = true;
  addInventory("maintenance_pin", "Maintenance pin", "A narrow release pin ejected by the communications console.");
  record(actor, "Reconstructed the last signal: COMMAND CODE 731. A maintenance pin was ejected.");
  setPhase("vault");
  notify("Transmission reconstructed", "COMMAND CODE 731. The command vault is responding.");
  render();
  openPanel("vault");
  return result(true, "TRANSMISSION_DECODED", "The complete transmission reads COMMAND CODE 731.", {
    message: "COMMAND CODE 731",
    commandCode: "731",
    recoveredItem: "maintenance_pin",
    unlockedSystem: "command_vault",
  });
}

function searchStationRecords(query, actor = "agent") {
  if (!state.transmissionDecoded) return locked("RECORDS_OFFLINE", "Decode the command transmission before accessing secured records.");
  const normalized = String(query || "").toLowerCase();
  record(actor, `Searched station records for “${query || "all records"}”.`);
  const relevant = !normalized || ["commander", "crew", "call sign", "callsign", "nightjar"].some((term) => normalized.includes(term));
  if (relevant) state.commanderDiscovered = true;
  render();
  return result(true, "RECORDS_SEARCHED", relevant ? "One command-level crew record matched." : "No records matched that query.", {
    matches: relevant ? [{ name: "Cmdr. Mara Venn", role: "Station Commander", callSign: "NIGHTJAR", clearance: "COMMAND" }] : [],
  });
}

function inspectInventoryItem(itemId, actor = "agent") {
  const item = state.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return result(false, "ITEM_NOT_FOUND", "That item is not in the recovered inventory.", { availableItems: state.inventory.map((entry) => entry.id) });
  record(actor, `Inspected ${item.name}.`);
  render();
  const observations = {
    cracked_access_card: "The casing has a pin-sized release aperture. Its embedded authorization element is intact.",
    maintenance_pin: "The pin matches the access-card release aperture.",
    authorization_token: "Physical authorization token TOKEN-04. Required for command vault access.",
    emergency_release_key: "Emergency release key ERK-7A. It authorizes the evacuation shuttle airlock.",
  };
  return result(true, "ITEM_INSPECTED", observations[itemId] || item.description, { item });
}

function combineInventoryItems(itemIds, actor = "agent") {
  const ids = [...new Set(itemIds || [])].sort();
  const expected = ["cracked_access_card", "maintenance_pin"].sort();
  if (expected.some((id) => !state.inventory.some((item) => item.id === id))) return result(false, "ITEMS_MISSING", "Both the cracked access card and maintenance pin are required.");
  if (ids.join("|") !== expected.join("|")) return result(false, "ITEMS_INCOMPATIBLE", "Those items cannot be combined.");
  state.inventory = state.inventory.filter((item) => !expected.includes(item.id));
  addInventory("authorization_token", "Authorization token", "TOKEN-04 · command clearance");
  state.tokenCreated = true;
  record(actor, "Opened the cracked access card with the maintenance pin and recovered TOKEN-04.");
  notify("Item recovered", "Physical authorization token TOKEN-04 added to inventory.");
  render();
  return result(true, "ITEMS_COMBINED", "The card casing opened, revealing authorization token TOKEN-04.", { createdItem: "authorization_token", token: "TOKEN-04" });
}

function submitVaultAuthorization(commandCode, callSign, token, actor = "agent") {
  if (!state.transmissionDecoded) return locked("VAULT_OFFLINE", "The command vault has not been activated.");
  if (!state.tokenCreated) return result(false, "PHYSICAL_TOKEN_REQUIRED", "Recover the physical authorization token before submitting credentials.");
  const correct = String(commandCode) === "731" && String(callSign).toUpperCase() === "NIGHTJAR" && String(token).toUpperCase() === "TOKEN-04";
  if (!correct) {
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 10);
    record(actor, "Submitted invalid command-vault authorization; 10 seconds lost.");
    render();
    return result(false, "AUTHORIZATION_REJECTED", "One or more authorization factors are incorrect; 10 seconds lost.");
  }
  state.vaultUnlocked = true;
  addInventory("emergency_release_key", "Emergency release key", "ERK-7A · evacuation systems");
  record(actor, "Opened the command vault and recovered emergency release key ERK-7A.");
  setPhase("escape");
  notify("Command vault opened", "Emergency release key ERK-7A recovered.");
  render();
  openPanel("escape");
  return result(true, "VAULT_OPENED", "Authorization accepted. Emergency release key ERK-7A recovered.", { releaseKey: "ERK-7A", unlockedSystem: "evacuation_airlock" });
}

function activateManualOverride(actor = "human") {
  if (!state.vaultUnlocked) return locked("VAULT_REQUIRED", "Open the command vault before activating the override.");
  state.overrideExpiresAt = Date.now() + 10000;
  record(actor, "Activated the physical airlock override. Remote release window opened for 10 seconds.");
  notify("Manual override active", "Agent release window open for 10 seconds.");
  clearInterval(overrideTimer);
  overrideTimer = setInterval(() => {
    if (!state.overrideExpiresAt || Date.now() >= state.overrideExpiresAt) {
      clearInterval(overrideTimer);
      if (!state.completed) {
        state.overrideExpiresAt = null;
        record("system", "Manual override window expired.");
      }
    }
    render();
  }, 250);
  render();
  return result(true, "OVERRIDE_ACTIVE", "Manual override active. Send the emergency release command within 10 seconds.", { expiresInSeconds: 10 });
}

function engageEmergencyRelease(releaseKey, destination, actor = "agent") {
  if (!state.vaultUnlocked) return locked("VAULT_REQUIRED", "The emergency release key is still inside the command vault.");
  const overrideActive = state.overrideExpiresAt && Date.now() < state.overrideExpiresAt;
  if (!overrideActive) return result(false, "HUMAN_OVERRIDE_REQUIRED", "The human player must activate the physical override before remote release.", { overrideActive: false });
  if (String(releaseKey).toUpperCase() !== "ERK-7A" || destination !== "evacuation_shuttle") return result(false, "RELEASE_AUTHORIZATION_REJECTED", "Release key or destination is invalid.");
  state.completed = true;
  state.overrideExpiresAt = null;
  record(actor, "Sent the authenticated emergency release command to the evacuation shuttle.");
  record("system", "Airlock released. Evacuation route secure. Mission complete.");
  setPhase("complete");
  clearInterval(missionTimer);
  clearInterval(overrideTimer);
  render();
  setTimeout(showVictory, 850);
  return result(true, "EVACUATION_CONFIRMED", "Airlock released. The evacuation shuttle is ready.", { missionComplete: true, timeRemaining: missionTime() });
}

function requestHint(actor = "agent") {
  const phase = state.phase === "complete" ? "escape" : state.phase;
  const depth = Math.min(state.hintDepth[phase], HINTS[phase].length - 1);
  const hint = HINTS[phase][depth];
  state.hintDepth[phase] = Math.min(depth + 1, HINTS[phase].length - 1);
  state.hintsUsed += 1;
  record(actor, `Requested mission hint: ${hint}`);
  notify("Station hint", hint);
  render();
  return result(true, "HINT_PROVIDED", hint, { objective: OBJECTIVES[state.phase]?.[1] });
}

function locked(code, message) {
  return result(false, code, message);
}

function getMissionStatus(actor = "agent") {
  record(actor, "Reviewed the mission status and available station systems.");
  render();
  return result(true, "STATUS_RETRIEVED", "Current mission state retrieved.", {
    timeRemaining: missionTime(),
    objective: OBJECTIVES[state.phase]?.[1],
    systems: {
      power: state.powerOnline ? "online" : state.overloaded ? "breaker_tripped" : "offline",
      communications: state.transmissionDecoded ? "decoded" : state.powerOnline ? "online" : "offline",
      commandVault: state.vaultUnlocked ? "open" : state.transmissionDecoded ? "active" : "sealed",
      evacuationAirlock: state.completed ? "open" : state.vaultUnlocked ? "awaiting_override" : "locked",
    },
    inventory: state.inventory.map(({ id, name }) => ({ id, name })),
  });
}

function inspectRoom(actor = "agent") {
  record(actor, "Surveyed the station control room.");
  render();
  return result(true, "ROOM_INSPECTED", "The room contains four linked systems and a maintenance placard.", {
    visibleSystems: ["power_grid", "signal_array", "command_vault", "evacuation_airlock"],
    placard: "ASTERIA-IV · WAKE → CALL → COMMAND → DEPART",
    observation: "System controls unlock in the same sequence shown on the placard.",
  });
}

function render() {
  $("#timer").textContent = missionTime();
  $("#timer").style.color = state.remainingSeconds < 120 ? "var(--red)" : "var(--amber)";
  const objective = OBJECTIVES[state.phase];
  $("#objective-number").textContent = objective[0];
  $("#objective-title").textContent = objective[1];
  $("#objective-description").textContent = objective[2];
  $("#hints-count").textContent = `${state.hintsUsed} hint${state.hintsUsed === 1 ? "" : "s"} used`;
  $("#inventory-count").textContent = `${state.inventory.length} item${state.inventory.length === 1 ? "" : "s"}`;

  const scene = $("#room-scene");
  scene.className = `room-scene ${state.completed ? "complete" : state.powerOnline ? "powered" : "emergency"}`;
  $("#room-title").textContent = state.completed ? "Evacuation route secure" : state.powerOnline ? "Primary systems responding" : "Emergency lighting only";
  $("#power-room-status").textContent = state.powerOnline ? "Online" : state.overloaded ? "Tripped" : "Fault";
  $("#signal-room-status").textContent = state.transmissionDecoded ? "Decoded" : state.powerOnline ? "Online" : "Offline";
  $("#vault-room-status").textContent = state.vaultUnlocked ? "Open" : state.transmissionDecoded ? "Active" : "Sealed";
  $("#escape-room-status").textContent = state.completed ? "Open" : state.vaultUnlocked ? "Ready" : "Locked";

  const unlocked = { power: true, signal: state.powerOnline, vault: state.transmissionDecoded, escape: state.vaultUnlocked };
  $$(".hotspot").forEach((node) => {
    const panel = node.dataset.panel;
    node.classList.toggle("locked", !unlocked[panel]);
    node.classList.toggle("selected", state.activePanel === panel && $("#system-drawer").classList.contains("open"));
    node.querySelector("small").style.color = panel === "power" && !state.powerOnline ? "var(--red)" : unlocked[panel] ? "var(--cyan)" : "var(--red)";
  });

  const phaseIndex = ["power", "signal", "vault", "escape", "complete"].indexOf(state.phase);
  $$(".progress-segment").forEach((node, index) => {
    node.classList.toggle("complete", index < phaseIndex || state.completed);
    node.classList.toggle("active", index === phaseIndex && !state.completed);
  });

  $("#inventory-grid").innerHTML = state.inventory.length
    ? state.inventory.map((item) => `<button class="inventory-item" data-item="${item.id}"><strong>${item.name}</strong><span>${item.description}</span></button>`).join("")
    : '<div class="empty-inventory">No items recovered</div>';
  $$('[data-item]').forEach((node) => node.addEventListener("click", () => {
    const response = inspectInventoryItem(node.dataset.item, "human");
    notify("Item inspection", response.message, !response.success);
  }));

  $("#activity-log").innerHTML = state.activity.map((entry) => `
    <article class="log-entry ${entry.actor}">
      <div><strong>${entry.actor}</strong><time>${entry.at}</time></div>
      <p>${entry.message}</p>
    </article>`).join("");

  $("#mission-status").innerHTML = state.completed ? "<i></i><span>Mission complete</span>" : state.powerOnline ? "<i></i><span>Systems recovering</span>" : "<i></i><span>Emergency mode</span>";
  if (state.activePanel && $("#system-drawer").classList.contains("open")) renderPanel(state.activePanel);
}

function openPanel(panel) {
  const requirements = { signal: state.powerOnline, vault: state.transmissionDecoded, escape: state.vaultUnlocked };
  if (panel !== "power" && panel !== "clue" && !requirements[panel]) {
    notify("System unavailable", "Restore the preceding station system first.", true);
    return;
  }
  state.activePanel = panel;
  $("#system-drawer").classList.add("open");
  render();
}

function renderPanel(panel) {
  const content = $("#drawer-content");
  const eyebrow = $("#drawer-eyebrow");
  const title = $("#drawer-title");
  if (panel === "clue") {
    eyebrow.textContent = "Maintenance placard";
    title.textContent = "Asteria operating sequence";
    content.innerHTML = `<div class="clue-card"><p>WAKE → CALL → COMMAND → DEPART<br><br>A faded constellation sketch appears below: ORION — LYRA — DRACO.</p></div>`;
    return;
  }
  if (panel === "power") {
    eyebrow.textContent = "System 01";
    title.textContent = "Power distribution";
    content.innerHTML = `
      <div class="drawer-grid">${Object.entries(RELAYS).map(([id, relay]) => `
        <button class="system-card relay-card ${state.selectedRelays.includes(id) ? "on" : ""} ${id === "auxiliary" ? "danger" : ""}" data-relay="${id}" ${state.powerOnline ? "disabled" : ""}>
          <h3>${relay.label}</h3><p>${relay.detail} · draw ${relay.draw}</p>
          <span class="relay-state">${state.selectedRelays.includes(id) ? "Routed" : "Standby"}</span>
        </button>`).join("")}</div>
      <div class="drawer-actions">
        <button class="primary-button" id="apply-power" ${state.powerOnline ? "disabled" : ""}>${state.powerOnline ? "Power restored" : "Apply routing"}</button>
        ${state.overloaded ? '<button class="secondary-button" id="reset-breaker">Reset breaker</button>' : ""}
        <span class="feedback-line ${state.overloaded ? "error" : state.powerOnline ? "success" : ""}">${state.overloaded ? "Main breaker tripped" : state.powerOnline ? "Life support and communications online" : `Selected load: ${state.selectedRelays.reduce((sum, id) => sum + RELAYS[id].draw, 0)} / 5`}</span>
      </div>`;
    $$('[data-relay]').forEach((node) => node.addEventListener("click", () => {
      const id = node.dataset.relay;
      state.selectedRelays = state.selectedRelays.includes(id) ? state.selectedRelays.filter((relay) => relay !== id) : [...state.selectedRelays, id];
      render();
    }));
    $("#apply-power")?.addEventListener("click", () => routePower(state.selectedRelays, "human"));
    $("#reset-breaker")?.addEventListener("click", () => resetBreaker("human"));
    return;
  }
  if (panel === "signal") {
    eyebrow.textContent = "System 02";
    title.textContent = "Deep-space receiver";
    const tuned = state.tunedFrequency ? SIGNALS[state.tunedFrequency] : null;
    content.innerHTML = `
      <div class="frequency-grid">${Object.keys(SIGNALS).map((frequency) => `<button class="frequency-button ${state.tunedFrequency === frequency ? "tuned" : ""}" data-frequency="${frequency}">${frequency}<small> MHz</small></button>`).join("")}</div>
      <div class="signal-readout">
        <div class="waveform">${tuned ? "⌁╲╱⌁╲╱⌁╲╱⌁╲╱⌁" : "····················"}</div>
        <p>${tuned ? `LOCKED ${state.tunedFrequency} MHz · BEARING ${tuned.bearing}` : "RECEIVER WAITING FOR FREQUENCY"}</p>
      </div>
      <div class="drawer-actions">
        <button class="primary-button" id="analyze-signal" ${!tuned ? "disabled" : ""}>Analyze signal</button>
        <button class="secondary-button" id="assemble-signal" ${state.analyzedSignals.length < 3 || state.transmissionDecoded ? "disabled" : ""}>Assemble selected order</button>
        <span class="feedback-line ${state.transmissionDecoded ? "success" : ""}">${state.transmissionDecoded ? "COMMAND CODE 731" : `${state.analyzedSignals.length} / 3 fragments analyzed`}</span>
      </div>
      <div class="fragment-list">${state.analyzedSignals.map((frequency) => { const signal = SIGNALS[frequency]; return `<button class="fragment ${state.fragmentOrder.includes(signal.constellation) ? "selected" : ""}" data-fragment="${signal.constellation}">${signal.constellation} · ${signal.fragment}</button>`; }).join("")}</div>
      ${state.fragmentOrder.length ? `<p class="feedback-line">Assembly: ${state.fragmentOrder.join(" → ")}</p>` : ""}`;
    $$('[data-frequency]').forEach((node) => node.addEventListener("click", () => tuneReceiver(Number(node.dataset.frequency), "human")));
    $("#analyze-signal")?.addEventListener("click", () => analyzeSignal("human"));
    $$('[data-fragment]').forEach((node) => node.addEventListener("click", () => {
      const id = node.dataset.fragment;
      state.fragmentOrder = state.fragmentOrder.includes(id) ? state.fragmentOrder.filter((value) => value !== id) : [...state.fragmentOrder, id];
      render();
    }));
    $("#assemble-signal")?.addEventListener("click", () => assembleTransmission(state.fragmentOrder, "human"));
    return;
  }
  if (panel === "vault") {
    eyebrow.textContent = "System 03";
    title.textContent = "Command vault";
    const hasParts = state.inventory.some((item) => item.id === "cracked_access_card") && state.inventory.some((item) => item.id === "maintenance_pin");
    content.innerHTML = state.vaultUnlocked ? `<div class="clue-card"><p>VAULT OPEN · Emergency release key ERK-7A recovered.<br>Two-party release protocol: physical override + authenticated remote command.</p></div>` : `
      <div class="drawer-grid">
        <div class="system-card"><h3>Secured crew records</h3><p>${state.commanderDiscovered ? "Commander Mara Venn · call sign NIGHTJAR" : "Command identity required."}</p><div class="drawer-actions"><button class="secondary-button" id="search-records">Search commander records</button></div></div>
        <div class="system-card"><h3>Physical token</h3><p>${state.tokenCreated ? "TOKEN-04 recovered and ready." : hasParts ? "Two recovered items appear mechanically compatible." : "Inspect the station and recovered items."}</p><div class="drawer-actions"><button class="secondary-button" id="combine-items" ${!hasParts ? "disabled" : ""}>Combine recovered items</button></div></div>
      </div>
      <form class="code-form" id="vault-form">
        <label>Command code<input name="commandCode" maxlength="3" autocomplete="off" placeholder="•••" /></label>
        <label>Commander call sign<input name="callSign" autocomplete="off" placeholder="CALL SIGN" /></label>
        <label>Physical token<input name="token" autocomplete="off" placeholder="TOKEN-••" /></label>
        <div class="drawer-actions"><button class="primary-button" type="submit">Submit authorization</button><span class="feedback-line">Three factors required</span></div>
      </form>`;
    $("#search-records")?.addEventListener("click", () => searchStationRecords("station commander", "human"));
    $("#combine-items")?.addEventListener("click", () => combineInventoryItems(["cracked_access_card", "maintenance_pin"], "human"));
    $("#vault-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      submitVaultAuthorization(data.get("commandCode"), data.get("callSign"), data.get("token"), "human");
    });
    return;
  }
  if (panel === "escape") {
    eyebrow.textContent = "System 04";
    title.textContent = "Evacuation airlock";
    const seconds = state.overrideExpiresAt ? Math.max(0, Math.ceil((state.overrideExpiresAt - Date.now()) / 1000)) : 0;
    const webMcpAvailable = Boolean(document.modelContext?.registerTool);
    content.innerHTML = `
      <div class="override-layout">
        <div class="override-control">
          <button class="override-button ${seconds ? "active" : ""}" id="override-button">${seconds ? "Override active" : "Activate manual override"}</button>
          <div class="override-timer">${seconds ? `Remote window · ${seconds}s` : "Physical control · human action"}</div>
        </div>
        <div class="authorization-panel">
          <p class="eyebrow">Remote release</p>
          <h3>Agent authorization required</h3>
          <p>Once the human override is active, the agent must authenticate the evacuation destination with the recovered key.</p>
          <code>KEY ERK-7A<br>DEST evacuation_shuttle</code>
          <div class="drawer-actions"><button class="secondary-button" id="manual-release" ${seconds && !webMcpAvailable ? "" : "disabled"}>${webMcpAvailable ? "Awaiting agent tool" : "Simulate agent command"}</button></div>
        </div>
      </div>`;
    $("#override-button")?.addEventListener("click", () => activateManualOverride("human"));
    $("#manual-release")?.addEventListener("click", () => engageEmergencyRelease("ERK-7A", "evacuation_shuttle", "human"));
  }
}

function startMission() {
  if (state.started) return;
  state.started = true;
  $("#intro-overlay").classList.add("hidden");
  record("human", "Entered the station control room and began the mission.");
  missionTimer = setInterval(() => {
    if (!state.started || state.completed) return;
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
    if (state.remainingSeconds === 0) {
      clearInterval(missionTimer);
      record("system", "Evacuation window expired. Reset the mission to try again.");
      notify("Mission failed", "The evacuation shuttle has departed.", true);
    }
    render();
  }, 1000);
  render();
}

function resetMission() {
  clearInterval(missionTimer);
  clearInterval(overrideTimer);
  state = initialState();
  $("#victory-overlay").classList.add("hidden");
  $("#intro-overlay").classList.remove("hidden");
  $("#system-drawer").classList.add("open");
  syncWebMCPTools();
  render();
}

function showVictory() {
  $("#score-time").textContent = missionTime();
  $("#score-agent").textContent = state.actions.agent;
  $("#score-human").textContent = state.actions.human;
  $("#score-hints").textContent = state.hintsUsed;
  $("#victory-overlay").classList.remove("hidden");
}

const BASE_TOOLS = [
  {
    name: "get_mission_status",
    description: "Get the current escape-room objective, remaining time, system states, and recovered inventory. Use this first and after major actions.",
    inputSchema: { type: "object", properties: {} },
    execute: () => getMissionStatus("agent"),
    annotations: { readOnlyHint: true },
  },
  {
    name: "inspect_station_room",
    description: "Survey the visible station control room and identify its systems, placards, and environmental clues.",
    inputSchema: { type: "object", properties: {} },
    execute: () => inspectRoom("agent"),
    annotations: { readOnlyHint: true },
  },
  {
    name: "request_mission_hint",
    description: "Request a progressively more explicit hint for the current objective. Hints affect the final mission score.",
    inputSchema: { type: "object", properties: {} },
    execute: () => requestHint("agent"),
    annotations: { readOnlyHint: false },
  },
  {
    name: "inspect_power_grid",
    description: "Inspect power relays, capacity, faults, and the station maintenance sequence before routing power.",
    inputSchema: { type: "object", properties: {} },
    execute: () => inspectPowerGrid("agent"),
    annotations: { readOnlyHint: true },
  },
  {
    name: "test_power_configuration",
    description: "Safely simulate a relay configuration without changing station power.",
    inputSchema: { type: "object", properties: { relays: { type: "array", items: { type: "string", enum: Object.keys(RELAYS) }, uniqueItems: true } }, required: ["relays"] },
    execute: ({ relays }) => testPowerConfiguration(relays, "agent"),
    annotations: { readOnlyHint: true },
  },
  {
    name: "route_power",
    description: "Apply a relay configuration to the station. Unsafe routes trip the breaker and cost mission time.",
    inputSchema: { type: "object", properties: { relays: { type: "array", items: { type: "string", enum: Object.keys(RELAYS) }, uniqueItems: true } }, required: ["relays"] },
    execute: ({ relays }) => routePower(relays, "agent"),
    annotations: { readOnlyHint: false },
  },
  {
    name: "reset_power_breaker",
    description: "Reset the main breaker after an unsafe relay configuration trips the grid.",
    inputSchema: { type: "object", properties: {} },
    execute: () => resetBreaker("agent"),
    annotations: { readOnlyHint: false },
  },
];

const SIGNAL_TOOLS = [
  { name: "scan_signal_frequencies", description: "Scan the powered communications band for stable transmissions and constellation clues.", inputSchema: { type: "object", properties: {} }, execute: () => scanFrequencies("agent"), annotations: { readOnlyHint: true } },
  { name: "tune_signal_receiver", description: "Tune the communications receiver to a frequency in MHz.", inputSchema: { type: "object", properties: { frequencyMHz: { type: "number", enum: [142.7, 311.9, 487.3] } }, required: ["frequencyMHz"] }, execute: ({ frequencyMHz }) => tuneReceiver(frequencyMHz, "agent"), annotations: { readOnlyHint: false } },
  { name: "analyze_tuned_signal", description: "Analyze the currently tuned signal and decode its constellation, bearing, and message fragment.", inputSchema: { type: "object", properties: {} }, execute: () => analyzeSignal("agent"), annotations: { readOnlyHint: true } },
  { name: "assemble_transmission", description: "Arrange all decoded fragments by constellation to reconstruct the command transmission.", inputSchema: { type: "object", properties: { constellationOrder: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", enum: ["ORION", "LYRA", "DRACO"] } } }, required: ["constellationOrder"] }, execute: ({ constellationOrder }) => assembleTransmission(constellationOrder, "agent"), annotations: { readOnlyHint: false } },
];

const VAULT_TOOLS = [
  { name: "search_station_records", description: "Search secured station crew records for command authorization information.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, execute: ({ query }) => searchStationRecords(query, "agent"), annotations: { readOnlyHint: true } },
  { name: "inspect_inventory_item", description: "Closely inspect one recovered inventory item for mechanisms, markings, or authorization data.", inputSchema: { type: "object", properties: { itemId: { type: "string", enum: ["cracked_access_card", "maintenance_pin", "authorization_token", "emergency_release_key"] } }, required: ["itemId"] }, execute: ({ itemId }) => inspectInventoryItem(itemId, "agent"), annotations: { readOnlyHint: true } },
  { name: "combine_inventory_items", description: "Combine two compatible recovered items to reveal or create a new item.", inputSchema: { type: "object", properties: { itemIds: { type: "array", minItems: 2, maxItems: 2, items: { type: "string", enum: ["cracked_access_card", "maintenance_pin"] } } }, required: ["itemIds"] }, execute: ({ itemIds }) => combineInventoryItems(itemIds, "agent"), annotations: { readOnlyHint: false } },
  { name: "submit_vault_authorization", description: "Submit the three required authorization factors to open the command vault. Confirm the factors with the human first.", inputSchema: { type: "object", properties: { commandCode: { type: "string", pattern: "^[0-9]{3}$" }, callSign: { type: "string" }, token: { type: "string" } }, required: ["commandCode", "callSign", "token"] }, execute: ({ commandCode, callSign, token }) => submitVaultAuthorization(commandCode, callSign, token, "agent"), annotations: { readOnlyHint: false } },
];

const ESCAPE_TOOLS = [
  { name: "engage_emergency_release", description: "Send the authenticated remote airlock release while the human's physical override window is active.", inputSchema: { type: "object", properties: { releaseKey: { type: "string", description: "Emergency release key recovered from the command vault." }, destination: { type: "string", enum: ["evacuation_shuttle"] } }, required: ["releaseKey", "destination"] }, execute: ({ releaseKey, destination }) => engageEmergencyRelease(releaseKey, destination, "agent"), annotations: { readOnlyHint: false } },
];

async function syncWebMCPTools() {
  const status = $("#connection-status");
  if (!document.modelContext?.registerTool) {
    status.className = "connection-status fallback";
    status.innerHTML = "<i></i><span>WebMCP preview unavailable · manual mode</span>";
    return;
  }
  const wanted = [
    ...BASE_TOOLS,
    ...(state.powerOnline ? SIGNAL_TOOLS : []),
    ...(state.transmissionDecoded ? VAULT_TOOLS : []),
    ...(state.vaultUnlocked ? ESCAPE_TOOLS : []),
  ];
  const wantedNames = new Set(wanted.map((tool) => tool.name));
  for (const [name, controller] of toolControllers) {
    if (!wantedNames.has(name)) {
      controller.abort();
      toolControllers.delete(name);
    }
  }
  for (const tool of wanted) {
    if (toolControllers.has(tool.name)) continue;
    const controller = new AbortController();
    try {
      await document.modelContext.registerTool({
        ...tool,
        execute: async (input) => JSON.stringify(await tool.execute(input || {})),
      }, { signal: controller.signal });
      toolControllers.set(tool.name, controller);
    } catch (error) {
      console.error(`Could not register WebMCP tool ${tool.name}`, error);
    }
  }
  status.className = "connection-status connected";
  status.innerHTML = `<i></i><span>WebMCP connected · ${toolControllers.size} tools</span>`;
}

$$('[data-panel]').forEach((node) => node.addEventListener("click", () => openPanel(node.dataset.panel)));
$("#close-drawer").addEventListener("click", () => {
  $("#system-drawer").classList.remove("open");
  render();
});
$("#hint-button").addEventListener("click", () => requestHint("human"));
$("#reset-button").addEventListener("click", resetMission);
$("#begin-mission").addEventListener("click", startMission);
$("#play-again").addEventListener("click", resetMission);
$("#copy-prompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#suggested-prompt").textContent);
    $("#copy-prompt").textContent = "Copied";
    setTimeout(() => { $("#copy-prompt").textContent = "Copy"; }, 1500);
  } catch {
    notify("Copy unavailable", "Select the prompt text and copy it manually.", true);
  }
});

window.lastSignal = {
  getState: () => structuredClone(state),
  commands: { inspectPowerGrid, testPowerConfiguration, routePower, resetBreaker, scanFrequencies, tuneReceiver, analyzeSignal, assembleTransmission, searchStationRecords, inspectInventoryItem, combineInventoryItems, submitVaultAuthorization, activateManualOverride, engageEmergencyRelease, getMissionStatus, inspectRoom, requestHint },
};

render();
syncWebMCPTools();
