(() => {
  "use strict";

  const DT = 0.5;
  const TREND_INTERVAL = 1;
  const HISTORY_SECONDS = 300;
  const CHART_WINDOW_SECONDS = 120;
  const SPEED_OPTIONS = Object.freeze([1, 2, 5, 10]);
  const PROCESS_MODELS = Object.freeze(["FOPDT", "INTEGRATING", "SOPDT"]);
  const PID_ALGORITHMS = Object.freeze(["I_PD", "PI_D", "PID"]);
  const DISTURBANCE_TYPES = Object.freeze(["STEP", "SQUARE", "SINE"]);
  const { computeVelocityPidDelta, isValidRange, normalizePidSignals } =
    window.PIDLoopCore;
  const DISTURBANCE_LABELS = Object.freeze({
    STEP: "Step",
    SQUARE: "Square",
    SINE: "Sine",
  });
  const PID_ALGORITHM_DESCRIPTIONS = Object.freeze({
    I_PD: "P: PV · I: Deviation · D: PV",
    PI_D: "P: Deviation · I: Deviation · D: PV",
    PID: "P: Deviation · I: Deviation · D: Deviation",
  });
  const INTEGRATING_BIAS_OP = 50;
  const PROCESS_DEFAULTS = Object.freeze({
    FOPDT: Object.freeze({ gain: 1, tau: 30, tau2: 10, deadTime: 5 }),
    INTEGRATING: Object.freeze({ gain: 0.05, tau: 30, tau2: 10, deadTime: 3 }),
    SOPDT: Object.freeze({ gain: 1, tau: 20, tau2: 10, deadTime: 5 }),
  });
  const PROCESS_DESCRIPTIONS = Object.freeze({
    FOPDT: "一阶自衡：输出改变后 PV 最终达到新的稳定值。",
    INTEGRATING: "非自衡：输出偏离平衡点时 PV 将持续变化。",
    SOPDT: "二阶自衡：两个惯性环节串联，响应更缓慢、更平滑。",
  });

  const DEFAULTS = Object.freeze({
    sp: 50,
    pv: 50,
    op: 50,
    pvLrv: 0,
    pvUrv: 100,
    pvUnit: "%",
    processModel: "FOPDT",
    pidAlgorithm: "I_PD",
    kc: 2,
    ti: 20,
    td: 2,
    gain: 1,
    tau: 30,
    tau2: 10,
    deadTime: 5,
    disturbance: -15,
    disturbanceType: "STEP",
    disturbancePeriod: 60,
  });
  const PB_MIN = 2;
  const PB_DEFAULT = 100 / DEFAULTS.kc;
  const ENGINEERING_VALUE_MIN = -100000;
  const ENGINEERING_VALUE_MAX = 100000;

  const $ = (id) => document.getElementById(id);

  const elements = {
    pvValue: $("pv-value"),
    spValue: $("sp-value"),
    opValue: $("op-value"),
    pvReadoutUnit: $("pv-readout-unit"),
    spReadoutUnit: $("sp-readout-unit"),
    modeDisplay: $("mode-display"),
    modeHelp: $("mode-help"),
    autoButton: $("auto-button"),
    manButton: $("man-button"),
    opInput: $("op-input"),
    spInput: $("sp-input"),
    spInputUnit: $("sp-input-unit"),
    pidAlgorithmInput: $("pid-algorithm-input"),
    pidAlgorithmNote: $("pid-algorithm-note"),
    pbInput: $("pb-input"),
    kcEquivalent: $("kc-equivalent"),
    pidSpanNote: $("pid-span-note"),
    tiInput: $("ti-input"),
    tdInput: $("td-input"),
    gainInput: $("gain-input"),
    tauInput: $("tau-input"),
    tau2Input: $("tau-2-input"),
    deadTimeInput: $("dead-time-input"),
    pvLrvInput: $("pv-lrv-input"),
    pvUrvInput: $("pv-urv-input"),
    pvUnitInput: $("pv-unit-input"),
    pvSpanValue: $("pv-span-value"),
    pvRangeUnit: $("pv-range-unit"),
    pvPctValue: $("pv-pct-value"),
    spPctValue: $("sp-pct-value"),
    errorPctValue: $("error-pct-value"),
    pvRangeHelp: $("pv-range-help"),
    processModelInput: $("process-model-input"),
    processModelNote: $("process-model-note"),
    advancedModelNote: $("advanced-model-note"),
    processDescription: $("process-description"),
    tauField: $("tau-field"),
    tau2Field: $("tau-2-field"),
    tauLabel: $("tau-label"),
    disturbanceInput: $("disturbance-input"),
    disturbanceTypeInput: $("disturbance-type-input"),
    disturbancePeriodInput: $("disturbance-period-input"),
    disturbancePeriodField: $("disturbance-period-field"),
    disturbanceButton: $("disturbance-button"),
    pauseButton: $("pause-button"),
    resetButton: $("reset-button"),
    simClock: $("sim-clock"),
    trendCount: $("trend-count"),
    simulationStatus: $("simulation-status"),
    spPvCanvas: $("sp-pv-chart"),
    speedButtons: [...document.querySelectorAll(".speed-button")],
  };

  const inputDefaults = new Map([
    [elements.pvLrvInput, DEFAULTS.pvLrv],
    [elements.pvUrvInput, DEFAULTS.pvUrv],
    [elements.pbInput, PB_DEFAULT],
    [elements.tiInput, DEFAULTS.ti],
    [elements.tdInput, DEFAULTS.td],
    [elements.gainInput, DEFAULTS.gain],
    [elements.tauInput, DEFAULTS.tau],
    [elements.tau2Input, DEFAULTS.tau2],
    [elements.deadTimeInput, DEFAULTS.deadTime],
    [elements.disturbanceInput, DEFAULTS.disturbance],
    [elements.disturbancePeriodInput, DEFAULTS.disturbancePeriod],
  ]);

  let state;
  let animationFrame = 0;
  let lastFrameTime = 0;
  let accumulator = 0;
  let simulationSpeed = 1;

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

  function textInputFallback(input, fallback) {
    return typeof input.dataset.lastValid === "string" ? input.dataset.lastValid : fallback;
  }

  function updateKcEquivalent(kc) {
    elements.kcEquivalent.textContent = `Equivalent Kc: ${formatNumber(kc, 2)}`;
    elements.pidSpanNote.textContent =
      `PB = ${formatNumber(100 / kc, 1)}% → Kc = ${formatNumber(kc, 2)} · PID input uses PV/SV in %Span`;
  }

  function updatePidAlgorithmUi() {
    const algorithm = PID_ALGORITHMS.includes(state.pidAlgorithm)
      ? state.pidAlgorithm
      : DEFAULTS.pidAlgorithm;
    elements.pidAlgorithmInput.value = algorithm;
    elements.pidAlgorithmNote.textContent = PID_ALGORITHM_DESCRIPTIONS[algorithm];
  }

  function readProportionalBand() {
    const raw = elements.pbInput.value.trim();
    const parsed = raw === "" ? Number.NaN : Number(raw);
    const fallback = inputFallback(elements.pbInput, PB_DEFAULT);
    const safeFallback = Number.isFinite(fallback) && fallback >= PB_MIN ? fallback : PB_DEFAULT;

    if (!Number.isFinite(parsed) || parsed < PB_MIN) {
      elements.pbInput.classList.add("invalid");
      elements.pbInput.setAttribute("aria-invalid", "true");
      const kc = 100 / safeFallback;
      updateKcEquivalent(kc);
      return kc;
    }

    elements.pbInput.classList.remove("invalid");
    elements.pbInput.setAttribute("aria-invalid", "false");
    elements.pbInput.dataset.lastValid = String(parsed);
    const kc = 100 / parsed;
    updateKcEquivalent(kc);
    return kc;
  }

  function readInput(input, fallback, min, max) {
    const raw = input.value.trim();
    const parsed = raw === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(parsed)) {
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
      return fallback;
    }

    const value = clamp(parsed, min, max);
    const isOutOfRange = parsed < min || parsed > max;
    input.classList.toggle("invalid", isOutOfRange);
    input.setAttribute("aria-invalid", String(isOutOfRange));
    input.dataset.lastValid = String(value);
    return value;
  }

  function writeInput(input, value) {
    const safeValue = finiteOr(value, 0);
    input.value = String(Math.round(safeValue * 1000) / 1000);
    input.dataset.lastValid = String(safeValue);
    input.classList.remove("invalid");
    input.setAttribute("aria-invalid", "false");
  }

  function writeTextInput(input, value) {
    const safeValue = String(value ?? "");
    input.value = safeValue;
    input.dataset.lastValid = safeValue;
    input.classList.remove("invalid");
    input.setAttribute("aria-invalid", "false");
  }

  function getPidParams() {
    return {
      pidAlgorithm: state.pidAlgorithm,
      kc: readProportionalBand(),
      ti: readInput(elements.tiInput, inputFallback(elements.tiInput, DEFAULTS.ti), 0, 600),
      td: readInput(elements.tdInput, inputFallback(elements.tdInput, DEFAULTS.td), 0, 120),
    };
  }

  function readPvRangeInputs() {
    const lrvRaw = elements.pvLrvInput.value.trim();
    const urvRaw = elements.pvUrvInput.value.trim();
    const lrv = lrvRaw === "" ? Number.NaN : Number(lrvRaw);
    const urv = urvRaw === "" ? Number.NaN : Number(urvRaw);
    const valid = isValidRange(lrv, urv);
    const unitRaw = elements.pvUnitInput.value.trim();
    const unitFallback = state?.pvRange?.unit || DEFAULTS.pvUnit;
    const unit = unitRaw || textInputFallback(elements.pvUnitInput, unitFallback);

    [elements.pvLrvInput, elements.pvUrvInput].forEach((input) => {
      input.classList.toggle("invalid", !valid);
      input.setAttribute("aria-invalid", String(!valid));
    });
    if (valid) {
      elements.pvLrvInput.dataset.lastValid = String(lrv);
      elements.pvUrvInput.dataset.lastValid = String(urv);
    }
    if (unitRaw) {
      elements.pvUnitInput.dataset.lastValid = unitRaw;
      elements.pvUnitInput.classList.remove("invalid");
      elements.pvUnitInput.setAttribute("aria-invalid", "false");
    }

    return { lrv, urv, unit, valid };
  }

  function syncPvRange() {
    const candidate = readPvRangeInputs();
    if (!state || !candidate.valid) return state?.pvRange;

    const previous = state.pvRange;
    const engineeringRangeChanged =
      !previous || candidate.lrv !== previous.lrv || candidate.urv !== previous.urv;
    const unitChanged = !previous || candidate.unit !== previous.unit;
    if (!engineeringRangeChanged && !unitChanged) return previous;

    state.pvRange = { lrv: candidate.lrv, urv: candidate.urv, unit: candidate.unit };
    if (engineeringRangeChanged) {
      syncPidHistory();
      state.justEnteredAuto = state.mode === "AUTO";
    }
    return state.pvRange;
  }

  function getNormalizedSignals() {
    return normalizePidSignals(
      state.pv,
      state.sp,
      state.pvRange.lrv,
      state.pvRange.urv,
    );
  }

  function updatePvRangeUi() {
    const range = state.pvRange;
    const signals = getNormalizedSignals();
    const unit = range.unit || "EU";
    const rangeInvalid =
      elements.pvLrvInput.getAttribute("aria-invalid") === "true" ||
      elements.pvUrvInput.getAttribute("aria-invalid") === "true";

    elements.pvSpanValue.textContent = formatNumber(range.urv - range.lrv, 2);
    elements.pvRangeUnit.textContent = unit;
    elements.pvPctValue.textContent = formatNumber(signals.pvPct, 2);
    elements.spPctValue.textContent = formatNumber(signals.spPct, 2);
    elements.errorPctValue.textContent = formatNumber(signals.errorPct, 2);
    elements.pvReadoutUnit.textContent = unit;
    elements.spReadoutUnit.textContent = unit;
    elements.spInputUnit.textContent = unit;
    elements.pvRangeHelp.textContent = rangeInvalid
      ? `URV must be greater than LRV. Using last valid range: ${formatNumber(
          range.lrv,
          2,
        )} … ${formatNumber(range.urv, 2)} ${unit}.`
      : "PID converts PV and SV to %Span; process dynamics remain in engineering units.";
  }

  function selectedProcessModel() {
    return PROCESS_MODELS.includes(elements.processModelInput.value)
      ? elements.processModelInput.value
      : DEFAULTS.processModel;
  }

  function setProcessParameterInputs(model) {
    const defaults = PROCESS_DEFAULTS[model] || PROCESS_DEFAULTS.FOPDT;
    writeInput(elements.gainInput, defaults.gain);
    writeInput(elements.tauInput, defaults.tau);
    writeInput(elements.tau2Input, defaults.tau2);
    writeInput(elements.deadTimeInput, defaults.deadTime);
  }

  function getProcessParams() {
    return {
      model: selectedProcessModel(),
      gain: readInput(elements.gainInput, inputFallback(elements.gainInput, DEFAULTS.gain), 0.01, 10),
      tau: readInput(elements.tauInput, inputFallback(elements.tauInput, DEFAULTS.tau), 0.1, 600),
      tau2: readInput(elements.tau2Input, inputFallback(elements.tau2Input, DEFAULTS.tau2), 0.1, 600),
      deadTime: readInput(
        elements.deadTimeInput,
        inputFallback(elements.deadTimeInput, DEFAULTS.deadTime),
        0,
        120,
      ),
    };
  }

  function getDisturbanceAmplitude() {
    return readInput(
      elements.disturbanceInput,
      inputFallback(elements.disturbanceInput, DEFAULTS.disturbance),
      -100,
      100,
    );
  }

  function getDisturbancePeriod() {
    return readInput(
      elements.disturbancePeriodInput,
      inputFallback(elements.disturbancePeriodInput, DEFAULTS.disturbancePeriod),
      5,
      600,
    );
  }

  function getDisturbanceValue() {
    if (!state.disturbanceEnabled) return 0;

    const amplitude = getDisturbanceAmplitude();
    const elapsed = Math.max(0, state.simTime - state.disturbanceStartTime);
    switch (state.disturbanceType) {
      case "SQUARE": {
        const period = getDisturbancePeriod();
        const phase = (elapsed % period) / period;
        return phase < 0.5 ? amplitude : -amplitude;
      }
      case "SINE": {
        const period = getDisturbancePeriod();
        return amplitude * Math.sin((2 * Math.PI * elapsed) / period);
      }
      case "STEP":
      default:
        return amplitude;
    }
  }

  function setDefaultInputs() {
    inputDefaults.forEach((value, input) => writeInput(input, value));
    elements.processModelInput.value = DEFAULTS.processModel;
    elements.pidAlgorithmInput.value = DEFAULTS.pidAlgorithm;
    elements.disturbanceTypeInput.value = DEFAULTS.disturbanceType;
    setProcessParameterInputs(DEFAULTS.processModel);
    writeInput(elements.spInput, DEFAULTS.sp);
    writeInput(elements.opInput, DEFAULTS.op);
    writeTextInput(elements.pvUnitInput, DEFAULTS.pvUnit);
    updateKcEquivalent(DEFAULTS.kc);
  }

  function normalizeInput(input) {
    const fallback = inputFallback(input, 0);
    const limits = {
      "sp-input": [ENGINEERING_VALUE_MIN, ENGINEERING_VALUE_MAX],
      "op-input": [0, 100],
      "pb-input": [PB_MIN, Number.POSITIVE_INFINITY],
      "ti-input": [0, 600],
      "td-input": [0, 120],
      "gain-input": [0.01, 10],
      "tau-input": [0.1, 600],
      "tau-2-input": [0.1, 600],
      "dead-time-input": [0, 120],
      "disturbance-input": [-100, 100],
      "disturbance-period-input": [5, 600],
    }[input.id];
    if (!limits) return;

    const raw = input.value.trim();
    const parsed = raw === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(parsed) || parsed < limits[0] || parsed > limits[1]) {
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
      return;
    }

    const value = readInput(input, fallback, limits[0], limits[1]);
    writeInput(input, value);
  }

  function processInput() {
    return finiteOr(state.op + getDisturbanceValue(), state.op);
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

  function syncPidHistory() {
    const signals = getNormalizedSignals();
    state.previousErrorPct = signals.errorPct;
    state.previousDeltaErrorPct = 0;
    state.previousPvPct = signals.pvPct;
    state.previousDeltaPvPct = 0;
  }

  function computePidDelta(params) {
    const signals = getNormalizedSignals();
    const result = computeVelocityPidDelta({
      dt: DT,
      pidAlgorithm: params.pidAlgorithm,
      kc: params.kc,
      ti: params.ti,
      td: params.td,
      errorPct: signals.errorPct,
      previousErrorPct: state.previousErrorPct,
      previousDeltaErrorPct: state.previousDeltaErrorPct,
      pvPct: signals.pvPct,
      previousPvPct: state.previousPvPct,
      previousDeltaPvPct: state.previousDeltaPvPct,
    });

    state.previousErrorPct = signals.errorPct;
    state.previousDeltaErrorPct = result.deltaErrorPct;
    state.previousPvPct = signals.pvPct;
    state.previousDeltaPvPct = result.deltaPvPct;
    return finiteOr(result.deltaMv, 0);
  }

  function computeAutoOutput(params) {
    if (state.justEnteredAuto) {
      state.justEnteredAuto = false;
      return state.op;
    }

    const deltaMv = computePidDelta(params);
    const candidateMv = state.op + deltaMv;
    return clamp(finiteOr(candidateMv, state.op), 0, 100);
  }

  function setMode(mode) {
    if (mode === state.mode) return;

    if (mode === "AUTO") {
      state.mode = "AUTO";
      syncPidHistory();
      state.justEnteredAuto = true;
    } else {
      state.mode = "MAN";
      syncPidHistory();
      state.justEnteredAuto = false;
    }
    updateUi();
  }

  function stepFopdt(params, delayedInput) {
    const rate = (params.gain * delayedInput - state.pv) / Math.max(params.tau, 0.1);
    state.pv = finiteOr(state.pv + DT * rate, state.pv);
  }

  function stepIntegrating(params, delayedInput) {
    state.pv = finiteOr(
      state.pv + DT * params.gain * (delayedInput - INTEGRATING_BIAS_OP),
      state.pv,
    );
  }

  function stepSopdt(params, delayedInput) {
    const tau1 = Math.max(params.tau, 0.1);
    const tau2 = Math.max(params.tau2, 0.1);
    state.processStage1 = finiteOr(
      state.processStage1 + DT * (params.gain * delayedInput - state.processStage1) / tau1,
      state.processStage1,
    );
    state.processStage1 = clamp(state.processStage1, -1000, 1000);
    state.pv = finiteOr(
      state.pv + DT * (state.processStage1 - state.pv) / tau2,
      state.pv,
    );
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
    switch (state.processModel) {
      case "INTEGRATING":
        stepIntegrating(params, delayedInput);
        break;
      case "SOPDT":
        stepSopdt(params, delayedInput);
        break;
      case "FOPDT":
      default:
        stepFopdt(params, delayedInput);
        break;
    }

    state.pv = clamp(finiteOr(state.pv, pvBefore), -1000, 1000);
    state.lastProcessInput = input;
  }

  function recordTrendSample() {
    const signals = getNormalizedSignals();
    state.history.push({
      time: state.simTime,
      sp: signals.spPct,
      pv: signals.pvPct,
      op: state.op,
    });
    const oldestAllowed = state.simTime - HISTORY_SECONDS;
    while (state.history.length > 1 && state.history[0].time < oldestAllowed) {
      state.history.shift();
    }
  }

  function stepSimulation() {
    state.sp = readInput(
      elements.spInput,
      state.sp,
      ENGINEERING_VALUE_MIN,
      ENGINEERING_VALUE_MAX,
    );
    syncPvRange();
    const pidParams = getPidParams();
    const processParams = getProcessParams();

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
    const simulationPaused = state ? state.simulationPaused : false;
    setDefaultInputs();
    state = {
      simTime: 0,
      lastTrendTime: 0,
      sp: DEFAULTS.sp,
      pv: DEFAULTS.pv,
      op: DEFAULTS.op,
      pvRange: {
        lrv: DEFAULTS.pvLrv,
        urv: DEFAULTS.pvUrv,
        unit: DEFAULTS.pvUnit,
      },
      mode: "AUTO",
      processModel: DEFAULTS.processModel,
      pidAlgorithm: DEFAULTS.pidAlgorithm,
      processStage1: DEFAULTS.pv,
      previousErrorPct: 0,
      previousDeltaErrorPct: 0,
      previousPvPct: 50,
      previousDeltaPvPct: 0,
      justEnteredAuto: false,
      delayBuffer: [],
      lastProcessInput: DEFAULTS.op,
      disturbanceEnabled: false,
      disturbanceType: DEFAULTS.disturbanceType,
      disturbanceStartTime: 0,
      simulationPaused,
      history: [],
      chartPercentMin: 0,
      chartPercentMax: 100,
    };
    syncPidHistory();
    initializeDelayBuffer(DEFAULTS.deadTime);
    recordTrendSample();
    lastFrameTime = performance.now();
    accumulator = 0;
    updateUi();
  }

  function updateProcessUi() {
    const model = state.processModel;
    const isIntegrating = model === "INTEGRATING";
    const isSopdt = model === "SOPDT";
    elements.processModelInput.value = model;
    elements.processModelNote.textContent = model;
    elements.advancedModelNote.textContent = model;
    elements.processDescription.textContent = PROCESS_DESCRIPTIONS[model];
    elements.tauLabel.textContent = isSopdt ? "Tau 1" : "Tau";
    elements.tauField.classList.toggle("is-hidden", isIntegrating);
    elements.tau2Field.classList.toggle("is-hidden", !isSopdt);
  }

  function setProcessModel(model) {
    const nextModel = PROCESS_MODELS.includes(model) ? model : DEFAULTS.processModel;
    if (nextModel === state.processModel) {
      updateProcessUi();
      return;
    }

    setProcessParameterInputs(nextModel);
    state.processModel = nextModel;
    state.processStage1 = state.pv;
    syncPidHistory();
    initializeDelayBuffer(getProcessParams().deadTime);
    updateUi();
  }

  function setPidAlgorithm(algorithm) {
    const nextAlgorithm = PID_ALGORITHMS.includes(algorithm)
      ? algorithm
      : DEFAULTS.pidAlgorithm;
    elements.pidAlgorithmInput.value = nextAlgorithm;
    if (!state || nextAlgorithm === state.pidAlgorithm) {
      if (state) updatePidAlgorithmUi();
      return;
    }

    state.pidAlgorithm = nextAlgorithm;
    syncPidHistory();
    state.justEnteredAuto = state.mode === "AUTO";
    updateUi();
  }

  function setDisturbanceType(type) {
    const nextType = DISTURBANCE_TYPES.includes(type)
      ? type
      : DEFAULTS.disturbanceType;
    elements.disturbanceTypeInput.value = nextType;
    if (!state || nextType === state.disturbanceType) {
      if (state) updateUi();
      return;
    }

    state.disturbanceType = nextType;
    state.disturbanceStartTime = state.simTime;
    updateUi();
  }

  function setSimulationPaused(paused) {
    if (!state) return;

    const nextPaused = Boolean(paused);
    if (nextPaused === state.simulationPaused) {
      updateUi();
      return;
    }

    state.simulationPaused = nextPaused;
    if (!nextPaused) {
      lastFrameTime = performance.now();
      accumulator = 0;
    }
    updateUi();
  }

  function setSimulationSpeed(value) {
    const nextSpeed = Number(value);
    if (!SPEED_OPTIONS.includes(nextSpeed)) return;

    simulationSpeed = nextSpeed;
    elements.speedButtons.forEach((button) => {
      const isActive = Number(button.dataset.speed) === simulationSpeed;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function updateChartScale() {
    for (const point of state.history) {
      if (point.pv < state.chartPercentMin + 5) {
        state.chartPercentMin = Math.floor((point.pv - 5) / 10) * 10;
      }
      if (point.pv > state.chartPercentMax - 5 || point.sp > state.chartPercentMax - 5) {
        state.chartPercentMax = Math.ceil((Math.max(point.pv, point.sp) + 5) / 10) * 10;
      }
    }
    state.chartPercentMax = Math.max(state.chartPercentMax, state.chartPercentMin + 20, 100);
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
      yMin: state.chartPercentMin,
      yMax: state.chartPercentMax,
      yTicks: 4,
      series: [
        { key: "pv", color: "#007b87" },
        { key: "sp", color: "#9c6a00" },
        { key: "op", color: "#b45b1f" },
      ],
    });
  }

  function updateUi() {
    if (!state) return;

    syncPvRange();
    const isPaused = state.simulationPaused;
    elements.simulationStatus.textContent = isPaused
      ? "SIMULATION PAUSED"
      : "SIMULATION ONLINE";
    elements.simulationStatus.classList.toggle("online", !isPaused);
    elements.simulationStatus.classList.toggle("paused", isPaused);
    updateProcessUi();
    updatePidAlgorithmUi();
    updatePvRangeUi();
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
    elements.spInput.disabled = !isAuto;
    elements.opInput.disabled = isAuto;
    elements.modeHelp.textContent = isAuto
      ? "AUTO：PID 根据归一化后的 PV / SV %Span 计算 MV。"
      : "MAN：PID 停止自动调节，可直接修改 MV。";

    if (isAuto || document.activeElement !== elements.opInput) {
      writeInput(elements.opInput, state.op);
    }

    const disturbanceLabel = DISTURBANCE_LABELS[state.disturbanceType] || DISTURBANCE_LABELS.STEP;
    elements.disturbanceTypeInput.value = state.disturbanceType;
    elements.disturbancePeriodField.classList.toggle("is-hidden", state.disturbanceType === "STEP");
    elements.disturbanceButton.textContent = `${disturbanceLabel} Load: ${state.disturbanceEnabled ? "ON" : "OFF"}`;
    elements.disturbanceButton.setAttribute("aria-pressed", String(state.disturbanceEnabled));
    elements.pauseButton.textContent = isPaused ? "Resume" : "Pause";
    elements.pauseButton.setAttribute("aria-pressed", String(isPaused));
  }

  function animationLoop(now) {
    if (!lastFrameTime) lastFrameTime = now;
    const elapsed = Math.min(0.25, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    if (!state.simulationPaused) {
      accumulator += elapsed * simulationSpeed;

      let steps = 0;
      while (accumulator >= DT && steps < 20) {
        stepSimulation();
        accumulator -= DT;
        steps += 1;
      }
      if (steps === 20 && accumulator >= DT) accumulator = 0;
    }

    updateUi();
    drawCharts();
    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  function attachEvents() {
    document.querySelectorAll(".mode-button").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    elements.speedButtons.forEach((button) => {
      button.addEventListener("click", () => setSimulationSpeed(button.dataset.speed));
    });

    elements.spInput.addEventListener("input", () => {
      state.sp = readInput(
        elements.spInput,
        state.sp,
        ENGINEERING_VALUE_MIN,
        ENGINEERING_VALUE_MAX,
      );
      updateUi();
    });

    [elements.pvLrvInput, elements.pvUrvInput, elements.pvUnitInput].forEach((input) => {
      input.addEventListener("input", () => {
        syncPvRange();
        updateUi();
      });
      input.addEventListener("change", () => {
        syncPvRange();
        updateUi();
      });
    });

    elements.pidAlgorithmInput.addEventListener("change", () => {
      setPidAlgorithm(elements.pidAlgorithmInput.value);
    });

    elements.pbInput.addEventListener("input", () => {
      readProportionalBand();
      updateUi();
    });

    elements.opInput.addEventListener("input", () => {
      if (state.mode !== "MAN") return;
      state.op = readInput(elements.opInput, state.op, 0, 100);
      state.op = clamp(state.op, 0, 100);
      updateUi();
    });

    [
      elements.pbInput,
      elements.spInput,
      elements.tiInput,
      elements.tdInput,
      elements.gainInput,
      elements.tauInput,
      elements.tau2Input,
      elements.deadTimeInput,
      elements.disturbanceInput,
      elements.disturbancePeriodInput,
    ].forEach((input) => {
      input.addEventListener("change", () => normalizeInput(input));
    });

    elements.processModelInput.addEventListener("change", () => {
      setProcessModel(elements.processModelInput.value);
    });

    elements.disturbanceTypeInput.addEventListener("change", () => {
      setDisturbanceType(elements.disturbanceTypeInput.value);
    });

    elements.disturbanceButton.addEventListener("click", () => {
      state.disturbanceEnabled = !state.disturbanceEnabled;
      if (state.disturbanceEnabled) state.disturbanceStartTime = state.simTime;
      updateUi();
    });

    elements.pauseButton.addEventListener("click", () => {
      setSimulationPaused(!state.simulationPaused);
    });
    elements.resetButton.addEventListener("click", resetSimulation);
    window.addEventListener("resize", drawCharts);
  }

  function start() {
    attachEvents();
    setSimulationSpeed(simulationSpeed);
    resetSimulation();
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  start();
})();
