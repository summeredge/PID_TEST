const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const css = read("style.css");
const app = read("app.js");
const core = read("pid-core.js");
const readFunction = (source, name, nextName) => {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
};

test("UI contract includes aligned controls, pause controls, and disturbance inputs", () => {
  for (const id of [
    "pause-button",
    "reset-button",
    "disturbance-type-input",
    "disturbance-input",
    "disturbance-period-input",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(
    html,
    /<div class="experiment-actions">[\s\S]*pause-button[\s\S]*reset-button[\s\S]*<\/div>/,
  );
  assert.match(html, /<option value="STEP">STEP<\/option>/);
  assert.match(html, /<option value="SQUARE">SQUARE<\/option>/);
  assert.match(html, /<option value="SINE">SINE<\/option>/);
  assert.match(html, /id="disturbance-period-input"[^>]*min="5"[^>]*max="600"/);
  assert.match(css, /--control-input-width:\s*150px/);
  assert.match(css, /--control-unit-width:\s*24px/);
  assert.match(css, /\.numeric-input[\s\S]*width:\s*100%/);
  assert.match(css, /\.model-select[\s\S]*width:\s*var\(--control-input-width\)/);
});

test("pause contract keeps the animation frame alive and resets elapsed time on resume", () => {
  assert.match(app, /simulationPaused/);
  assert.match(html, /id="simulation-status"/);
  const animationLoop = readFunction(app, "animationLoop", "attachEvents");
  assert.match(animationLoop, /if \(!state\.simulationPaused\)/);
  assert.match(animationLoop, /stepSimulation\(\)/);
  assert.match(app, /lastFrameTime = performance\.now\(\);\s*accumulator = 0;/);
  assert.match(app, /const simulationPaused = state \? state\.simulationPaused : false/);
  assert.match(app, /pauseButton\.textContent = isPaused \? "Resume" : "Pause"/);
  assert.match(app, /SIMULATION PAUSED/);
});

test("disturbance contract uses one process-input entry and simulation time waveforms", () => {
  const disturbanceFunction = readFunction(app, "getDisturbanceValue", "setDefaultInputs");
  assert.match(app, /DISTURBANCE_TYPES = Object\.freeze\(\["STEP", "SQUARE", "SINE"\]\)/);
  assert.match(disturbanceFunction, /case "STEP"/);
  assert.match(disturbanceFunction, /case "SQUARE"/);
  assert.match(disturbanceFunction, /case "SINE"/);
  assert.match(disturbanceFunction, /state\.simTime - state\.disturbanceStartTime/);
  assert.doesNotMatch(disturbanceFunction, /Date\.now|performance\.now/);
  assert.match(app, /state\.op \+ getDisturbanceValue\(\)/);
  assert.doesNotMatch(app, /state\.disturbanceEnabled \? getDisturbance\(\) : 0/);

  const value = (type, amplitude, period, elapsed) => {
    if (type === "STEP") return amplitude;
    if (type === "SQUARE") return (elapsed % period) / period < 0.5 ? amplitude : -amplitude;
    return amplitude * Math.sin((2 * Math.PI * elapsed) / period);
  };

  assert.equal(value("STEP", -15, 60, 12), -15);
  assert.equal(value("SQUARE", -15, 60, 10), -15);
  assert.equal(value("SQUARE", -15, 60, 40), 15);
  assert.ok(Math.abs(value("SINE", -15, 60, 0)) < 1e-12);
  assert.ok(Math.abs(value("SINE", -15, 60, 15) + 15) < 1e-12);
  assert.ok(Math.abs(value("SINE", -15, 60, 30)) < 1e-12);
});

test("DCS PV contract separates raw process PV from the DCS signal", () => {
  assert.match(core, /const DCS_PV_MIN_PCT = -4\.5/);
  assert.match(core, /const DCS_PV_MAX_PCT = 104\.5/);
  assert.match(core, /function clampDcsPvPercent\(value\)/);
  assert.match(core, /function getDcsNormalizedSignals\(pv, sp, lrv, urv\)/);
  assert.match(core, /dcsPvPct = clampDcsPvPercent\(rawSignals\.rawPvPct\)/);
  assert.match(core, /dcsPvEngineering: percentToEngineering\(dcsPvPct, lrv, urv\)/);
  assert.match(app, /getDcsNormalizedSignals/);
  assert.doesNotMatch(app, /normalizePidSignals/);
  assert.doesNotMatch(app, /ENGINEERING_VALUE_MIN|ENGINEERING_VALUE_MAX/);

  const processStep = readFunction(app, "stepProcess", "recordTrendSample");
  assert.doesNotMatch(processStep, /state\.pvRange/);
  assert.match(processStep, /state\.pv = clamp\(finiteOr\(state\.pv, pvBefore\), -1000, 1000\)/);

  const trend = readFunction(app, "recordTrendSample", "stepSimulation");
  assert.match(trend, /const signals = getDcsSignals\(\)/);
  assert.match(trend, /pv: signals\.pvPct/);

  const pid = readFunction(app, "computePidDelta", "computeAutoOutput");
  assert.match(pid, /const signals = getDcsSignals\(\)/);
  assert.match(pid, /pvPct: signals\.pvPct/);
});

test("MV contribution trend uses controller term deltas and reset state", () => {
  assert.match(html, /id="pid-contribution-chart"/);
  assert.match(html, /P \/ I \/ D → MV 每周期增量贡献/);
  assert.match(html, /id="pid-contribution-tooltip"/);
  assert.equal((html.match(/data-contribution-series=/g) || []).length, 3);
  assert.match(app, /const DT = 0\.5;\s*const TREND_INTERVAL = DT;/);
  assert.match(html, /Trend sample <strong>0\.5 s<\/strong>/);

  const pid = readFunction(app, "computePidDelta", "computeAutoOutput");
  assert.match(pid, /previousPTerm: state\.pidTerms\.pTerm/);
  assert.match(pid, /previousITerm: state\.pidTerms\.iTerm/);
  assert.match(pid, /previousDTerm: state\.pidTerms\.dTerm/);
  assert.match(pid, /deltaMvP: finiteOr\(result\.deltaP, 0\)/);
  assert.match(pid, /deltaMvI: finiteOr\(result\.deltaI, 0\)/);
  assert.match(pid, /deltaMvD: finiteOr\(result\.deltaD, 0\)/);

  const trend = readFunction(app, "recordTrendSample", "stepSimulation");
  assert.match(trend, /deltaMvP: state\.currentContributions\.deltaMvP/);
  assert.match(trend, /deltaMvI: state\.currentContributions\.deltaMvI/);
  assert.match(trend, /deltaMvD: state\.currentContributions\.deltaMvD/);

  const reset = readFunction(app, "resetSimulation", "updateProcessUi");
  assert.match(reset, /history: \[\]/);
  assert.match(reset, /pidTerms:/);
  assert.match(reset, /currentContributions:/);
  assert.match(reset, /syncPidHistory\(\)/);
  assert.match(reset, /recordTrendSample\(\)/);

  assert.match(app, /zeroLine: true/);
  assert.match(app, /contributionVisibility\[key\] = !contributionVisibility\[key\]/);
  assert.match(app, /updateContributionTooltip/);
  assert.match(css, /\.chart-tooltip/);
});

test("SV follows the live PV range without changing process PV", () => {
  const rangeSync = readFunction(app, "syncPvRange", "syncSpInputRange");
  assert.match(rangeSync, /state\.sp = clamp\(state\.sp, candidate\.lrv, candidate\.urv\)/);
  assert.match(rangeSync, /writeInput\(elements\.spInput, state\.sp\)/);
  assert.match(rangeSync, /syncPidHistory\(\)/);
  assert.match(rangeSync, /state\.justEnteredAuto = state\.mode === "AUTO"/);

  const inputRange = readFunction(app, "syncSpInputRange", "getDcsSignals");
  assert.match(inputRange, /elements\.spInput\.min = String\(state\.pvRange\.lrv\)/);
  assert.match(inputRange, /elements\.spInput\.max = String\(state\.pvRange\.urv\)/);

  const ui = readFunction(app, "updateUi", "animationLoop");
  assert.match(ui, /elements\.pvValue\.textContent = formatNumber\(signals\.dcsPvEngineering\)/);
  assert.match(ui, /elements\.spInput\.disabled = false/);
  assert.doesNotMatch(ui, /elements\.spInput\.disabled = !isAuto/);
});
