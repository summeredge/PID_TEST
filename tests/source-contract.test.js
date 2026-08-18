const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const css = read("style.css");
const app = read("app.js");
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
