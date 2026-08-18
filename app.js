(() => {
  "use strict";

  const DT = 0.5;
  const TREND_INTERVAL = 1;
  const HISTORY_SECONDS = 300;
  const CHART_WINDOW_SECONDS = 120;

  const DEFAULTS = Object.freeze({
    sp: 50,
    pv: 50,
    op: 50,
    kc: 2,
    ti: 20,
    td: 2,
    gain: 1,
    tau: 30,
    deadTime: 5,
    disturbance: -15,
  });

  const $ = (id) => document.getElementById(id);

  const elements = {
    pvValue: $("pv-value"),
    spValue: $("sp-value"),
    opValue: $("op-value"),
    modeDisplay: $("mode-display"),
    modeHelp: $("mode-help"),
    autoButton: $("auto-button"),
    manButton: $("man-button"),
    opInput: $("op-input"),
    spInput: $("sp-input"),
    kcInput: $("kc-input"),
    tiInput: $("ti-input"),
    tdInput: $("td-input"),
    gainInput: $("gain-input"),
    tauInput: $("tau-input"),
    deadTimeInput: $("dead-time-input"),
    disturbanceInput: $("disturbance-input"),
    spStepButton: $("sp-step-button"),
    disturbanceButton: $("disturbance-button"),
    resetButton: $("reset-button"),
    simClock: $("sim-clock"),
    trendCount: $("trend-count"),
    spPvCanvas: $("sp-pv-chart"),
    opCanvas: $("op-chart"),
  };

  const inputDefaults = new Map([
    [elements.kcInput, DEFAULTS.kc],
    [elements.tiInput, DEFAULTS.ti],
    [elements.tdInput, DEFAULTS.td],
    [elements.gainInput, DEFAULTS.gain],
    [elements.tauInput, DEFAULTS.tau],
    [elements.deadTimeInput, DEFAULTS.deadTime],
    [elements.disturbanceInput, DEFAULTS.disturbance],
  ]);

  let state;
  let animationFrame = 0;
  let lastFrameTime = 0;
  let accumulator = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function formatNumber(value, digits = 1) {
    return finiteOr(value, 0).toFixed(digits);
  }

  function inputFallback(input, fallback) {
    const remembered = Number(input.dataset.lastValid);
    return Number.isFinite(remembered) ? remembered : fallback;
  }

  function readInput(input, fallback, min, max) {
    const raw = input.value.trim();
    const parsed = raw === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(parsed)) {
      input.classList.add("invalid");
      return fallback;
    }

    const value = clamp(parsed, min, max);
    input.classList.remove("invalid");
    input.dataset.lastValid = String(value);
    return value;
  }

  function writeInput(input, value) {
    const safeValue = finiteOr(value, 0);
    input.value = String(Math.round(safeValue * 1000) / 1000);
    input.dataset.lastValid = String(safeValue);
    input.classList.remove("invalid");
  }

  function getPidParams() {
    return {
      kc: readInput(elements.kcInput, inputFallback(elements.kcInput, DEFAULTS.kc), 0, 50),
      ti: readInput(elements.tiInput, inputFallback(elements.tiInput, DEFAULTS.ti), 0, 600),
      td: readInput(elements.tdInput, inputFallback(elements.tdInput, DEFAULTS.td), 0, 120),
    };
  }

  function getProcessParams() {
    return {
      gain: readInput(elements.gainInput, inputFallback(elements.gainInput, DEFAULTS.gain), 0.01, 10),
      tau: readInput(elements.tauInput, inputFallback(elements.tauInput, DEFAULTS.tau), 0.1, 600),
      deadTime: readInput(
        elements.deadTimeInput,
        inputFallback(elements.deadTimeInput, DEFAULTS.deadTime),
        0,
        120,
      ),
    };
  }

  function getDisturbance() {
    return readInput(
      elements.disturbanceInput,
      inputFallback(elements.disturbanceInput, DEFAULTS.disturbance),
      -100,
      100,
    );
  }

  function setDefaultInputs() {
    inputDefaults.forEach((value, input) => writeInput(input, value));
    writeInput(elements.spInput, DEFAULTS.sp);
    writeInput(elements.opInput, DEFAULTS.op);
  }

  function normalizeInput(input) {
    const fallback = inputFallback(input, 0);
    const limits = {
      "sp-input": [0, 100],
      "op-input": [0, 100],
      "kc-input": [0, 50],
      "ti-input": [0, 600],
      "td-input": [0, 120],
      "gain-input": [0.01, 10],
      "tau-input": [0.1, 600],
      "dead-time-input": [0, 120],
      "disturbance-input": [-100, 100],
    }[input.id];
    if (!limits) return;
    const value = readInput(input, fallback, limits[0], limits[1]);
    writeInput(input, value);
  }

  function processInput() {
    const load = state.disturbanceEnabled ? getDisturbance() : 0;
    return finiteOr(state.op + load, state.op);
  }

  function delayStepsFor(deadTime) {
    return Math.max(0, Math.round(deadTime / DT));
  }

  function syncDelayBuffer(params) {
    const requiredSteps = delayStepsFor(params.deadTime);
    if (requiredSteps === state.delayBuffer.length) return;

    const seedInput = finiteOr(state.lastProcessInput, processInput());
    state.delayBuffer = Array(requiredSteps).fill(seedInput);
  }

  function initializeDelayBuffer(deadTime) {
    const steps = delayStepsFor(deadTime);
    state.lastProcessInput = processInput();
    state.delayBuffer = Array(steps).fill(state.lastProcessInput);
  }

  function derivativeTerm(params) {
    const pvRate = (state.pv - state.previousPv) / DT;
    return -params.td * pvRate;
  }

  function computeAutoOutput(params) {
    const error = state.sp - state.pv;
    const dTerm = derivativeTerm(params);
    const integralTerm = params.ti > 0 ? state.integral / params.ti : 0;
    const rawOutput = params.kc * (error + integralTerm + dTerm) + state.outputBias;
    const output = clamp(finiteOr(rawOutput, state.op), 0, 100);

    if (params.ti > 0) {
      const candidateIntegral = state.integral + error * DT;
      const saturatedHigh = rawOutput > 100 && error < 0;
      const saturatedLow = rawOutput < 0 && error > 0;
      if (rawOutput >= 0 && rawOutput <= 100 || saturatedHigh || saturatedLow) {
        state.integral = candidateIntegral;
      }
    }

    return output;
  }

  function prepareBumplessAuto(params) {
    const error = state.sp - state.pv;
    const dTerm = derivativeTerm(params);
    state.outputBias = 0;

    if (params.ti > 0 && Math.abs(params.kc) > 1e-9) {
      state.integral = (state.op / params.kc - error - dTerm) * params.ti;
    } else {
      state.outputBias = state.op - params.kc * (error + dTerm);
      state.integral = 0;
    }
    state.previousPv = state.pv;
  }

  function setMode(mode) {
    if (mode === state.mode) return;

    const params = getPidParams();
    if (mode === "AUTO") {
      prepareBumplessAuto(params);
      state.mode = "AUTO";
    } else {
      state.mode = "MAN";
      state.previousPv = state.pv;
    }
    updateUi();
  }

  function stepProcess(params) {
    syncDelayBuffer(params);
    const input = processInput();
    let delayedInput = input;

    if (state.delayBuffer.length > 0) {
      delayedInput = state.delayBuffer.shift();
      state.delayBuffer.push(input);
    }

    const pvBefore = state.pv;
    const rate = (params.gain * delayedInput - pvBefore) / Math.max(params.tau, 0.1);
    state.pv = finiteOr(pvBefore + DT * rate, pvBefore);
    state.pv = clamp(state.pv, -1000, 1000);
    state.lastProcessInput = input;
    state.previousPv = pvBefore;
  }

  function recordTrendSample() {
    state.history.push({
      time: state.simTime,
      sp: state.sp,
      pv: state.pv,
      op: state.op,
    });
    const oldestAllowed = state.simTime - HISTORY_SECONDS;
    while (state.history.length > 1 && state.history[0].time < oldestAllowed) {
      state.history.shift();
    }
  }

  function stepSimulation() {
    const pidParams = getPidParams();
    const processParams = getProcessParams();
    state.sp = readInput(elements.spInput, state.sp, 0, 100);

    if (state.mode === "AUTO") {
      state.op = computeAutoOutput(pidParams);
    } else {
      state.op = readInput(elements.opInput, state.op, 0, 100);
    }
    state.op = clamp(finiteOr(state.op, 0), 0, 100);

    stepProcess(processParams);
    state.simTime += DT;

    if (state.simTime - state.lastTrendTime >= TREND_INTERVAL - 1e-9) {
      recordTrendSample();
      state.lastTrendTime = state.simTime;
    }
  }

  function resetSimulation() {
    setDefaultInputs();
    state = {
      simTime: 0,
      lastTrendTime: 0,
      sp: DEFAULTS.sp,
      pv: DEFAULTS.pv,
      op: DEFAULTS.op,
      mode: "AUTO",
      integral: DEFAULTS.op / DEFAULTS.kc * DEFAULTS.ti,
      previousPv: DEFAULTS.pv,
      outputBias: 0,
      delayBuffer: [],
      lastProcessInput: DEFAULTS.op,
      disturbanceEnabled: false,
      history: [],
      chartPvMin: 0,
      chartPvMax: 100,
    };
    initializeDelayBuffer(DEFAULTS.deadTime);
    recordTrendSample();
    lastFrameTime = performance.now();
    accumulator = 0;
    updateUi();
  }

  function setSetpoint(value) {
    state.sp = clamp(finiteOr(value, state.sp), 0, 100);
    writeInput(elements.spInput, state.sp);
    updateUi();
  }

  function updateChartScale() {
    for (const point of state.history) {
      if (point.pv < state.chartPvMin + 5) {
        state.chartPvMin = Math.floor((point.pv - 5) / 10) * 10;
      }
      if (point.pv > state.chartPvMax - 5 || point.sp > state.chartPvMax - 5) {
        state.chartPvMax = Math.ceil((Math.max(point.pv, point.sp) + 5) / 10) * 10;
      }
    }
    state.chartPvMax = Math.max(state.chartPvMax, state.chartPvMin + 20, 100);
  }

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.floor(width * dpr);
    const pixelHeight = Math.floor(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { context, width, height };
  }

  function chartGeometry(width, height, yMin, yMax) {
    const left = 48;
    const right = 15;
    const top = 12;
    const bottom = 30;
    return {
      left,
      right,
      top,
      bottom,
      plotWidth: Math.max(1, width - left - right),
      plotHeight: Math.max(1, height - top - bottom),
      yMin,
      yMax,
      xStart: Math.max(0, state.simTime - CHART_WINDOW_SECONDS),
      xEnd: Math.max(CHART_WINDOW_SECONDS, state.simTime),
    };
  }

  function drawGrid(context, geometry, yTicks) {
    const { left, top, plotWidth, plotHeight, yMin, yMax, xStart, xEnd } = geometry;
    context.lineWidth = 1;
    context.strokeStyle = "#c3ccd1";
    context.fillStyle = "#5e6b72";
    context.font = "10px Segoe UI, Microsoft YaHei, sans-serif";

    for (let index = 0; index <= yTicks; index += 1) {
      const ratio = index / yTicks;
      const y = top + plotHeight * ratio;
      context.beginPath();
      context.moveTo(left, y + 0.5);
      context.lineTo(left + plotWidth, y + 0.5);
      context.stroke();

      const value = yMax - (yMax - yMin) * ratio;
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(formatNumber(value, 0), left - 8, y);
    }

    const verticalTicks = 4;
    for (let index = 0; index <= verticalTicks; index += 1) {
      const ratio = index / verticalTicks;
      const x = left + plotWidth * ratio;
      context.beginPath();
      context.moveTo(x + 0.5, top);
      context.lineTo(x + 0.5, top + plotHeight);
      context.stroke();

      const time = xStart + (xEnd - xStart) * ratio;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(`${formatNumber(time, 0)} s`, x, top + plotHeight + 9);
    }
  }

  function drawSeries(context, geometry, key, color) {
    const { left, top, plotWidth, plotHeight, yMin, yMax, xStart, xEnd } = geometry;
    const timeSpan = Math.max(1, xEnd - xStart);
    const valueSpan = Math.max(1, yMax - yMin);
    let started = false;

    context.beginPath();
    for (const point of state.history) {
      if (point.time < xStart || point.time > xEnd) continue;
      const value = finiteOr(point[key], 0);
      const x = left + ((point.time - xStart) / timeSpan) * plotWidth;
      const y = top + (1 - (value - yMin) / valueSpan) * plotHeight;
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }

    if (!started) return;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
  }

  function drawChart(canvas, options) {
    const sized = resizeCanvas(canvas);
    if (!sized) return;

    const { context, width, height } = sized;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f3f5f5";
    context.fillRect(0, 0, width, height);

    const geometry = chartGeometry(width, height, options.yMin, options.yMax);
    drawGrid(context, geometry, options.yTicks);
    for (const series of options.series) {
      drawSeries(context, geometry, series.key, series.color);
    }
  }

  function drawCharts() {
    if (!state) return;
    updateChartScale();
    drawChart(elements.spPvCanvas, {
      yMin: state.chartPvMin,
      yMax: state.chartPvMax,
      yTicks: 4,
      series: [
        { key: "sp", color: "#9c6a00" },
        { key: "pv", color: "#007b87" },
      ],
    });
    drawChart(elements.opCanvas, {
      yMin: 0,
      yMax: 100,
      yTicks: 4,
      series: [{ key: "op", color: "#b45b1f" }],
    });
  }

  function updateUi() {
    if (!state) return;

    elements.pvValue.textContent = formatNumber(state.pv);
    elements.spValue.textContent = formatNumber(state.sp);
    elements.opValue.textContent = formatNumber(state.op);
    elements.simClock.textContent = `t = ${formatNumber(state.simTime)} s`;
    elements.trendCount.textContent = `${state.history.length} samples`;

    const isAuto = state.mode === "AUTO";
    elements.modeDisplay.textContent = state.mode;
    elements.modeDisplay.classList.toggle("auto", isAuto);
    elements.modeDisplay.classList.toggle("man", !isAuto);
    elements.autoButton.classList.toggle("active", isAuto);
    elements.manButton.classList.toggle("active", !isAuto);
    elements.opInput.disabled = isAuto;
    elements.modeHelp.textContent = isAuto
      ? "AUTO：PID 根据 SP − PV 计算输出。"
      : "MAN：PID 停止控制，OP 输入可直接修改。";

    if (isAuto || document.activeElement !== elements.opInput) {
      writeInput(elements.opInput, state.op);
    }

    const nextStep = Math.abs(state.sp - 70) < 0.01 ? "50" : "70";
    elements.spStepButton.textContent = `SP Step (→ ${nextStep})`;
    elements.disturbanceButton.textContent = state.disturbanceEnabled
      ? "Load Disturbance: ON"
      : "Load Disturbance: OFF";
    elements.disturbanceButton.setAttribute("aria-pressed", String(state.disturbanceEnabled));
  }

  function animationLoop(now) {
    if (!lastFrameTime) lastFrameTime = now;
    const elapsed = Math.min(0.25, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    accumulator += elapsed;

    let steps = 0;
    while (accumulator >= DT && steps < 20) {
      stepSimulation();
      accumulator -= DT;
      steps += 1;
    }
    if (steps === 20 && accumulator >= DT) accumulator = 0;

    updateUi();
    drawCharts();
    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  function attachEvents() {
    document.querySelectorAll(".mode-button").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    elements.spInput.addEventListener("input", () => {
      state.sp = readInput(elements.spInput, state.sp, 0, 100);
      updateUi();
    });

    elements.opInput.addEventListener("input", () => {
      if (state.mode !== "MAN") return;
      state.op = readInput(elements.opInput, state.op, 0, 100);
      state.op = clamp(state.op, 0, 100);
      updateUi();
    });

    [
      elements.kcInput,
      elements.tiInput,
      elements.tdInput,
      elements.gainInput,
      elements.tauInput,
      elements.deadTimeInput,
      elements.disturbanceInput,
    ].forEach((input) => {
      input.addEventListener("change", () => normalizeInput(input));
    });

    elements.spStepButton.addEventListener("click", () => {
      setSetpoint(Math.abs(state.sp - 70) < 0.01 ? 50 : 70);
    });

    elements.disturbanceButton.addEventListener("click", () => {
      state.disturbanceEnabled = !state.disturbanceEnabled;
      updateUi();
    });

    elements.resetButton.addEventListener("click", resetSimulation);
    window.addEventListener("resize", drawCharts);
  }

  function start() {
    attachEvents();
    resetSimulation();
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  start();
})();
