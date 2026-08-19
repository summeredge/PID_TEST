const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DCS_PV_MAX_PCT,
  DCS_PV_MIN_PCT,
  clampDcsPvPercent,
  computeVelocityPidDelta,
  engineeringToPercent,
  getDcsNormalizedSignals,
  isValidRange,
  normalizePidSignals,
  percentToEngineering,
} = require("../pid-core.js");

function firstResponse(pidAlgorithm, pv, sp, lrv, urv) {
  const signals = normalizePidSignals(pv, sp, lrv, urv);
  return computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm,
    kc: 2,
    ti: 0,
    td: 0,
    errorPct: signals.errorPct,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: signals.pvPct,
    previousPvPct: signals.pvPct,
    previousDeltaPvPct: 0,
  }).deltaMv;
}

test("engineering and %Span conversion uses the configured range", () => {
  assert.equal(engineeringToPercent(50, 0, 100), 50);
  assert.equal(engineeringToPercent(50, 0, 200), 25);
  assert.equal(engineeringToPercent(0, -50, 50), 50);
  assert.equal(percentToEngineering(25, 0, 200), 50);
});

test("DCS PV clamps only the normalized measurement and returns engineering value", () => {
  assert.equal(DCS_PV_MIN_PCT, -4.5);
  assert.equal(DCS_PV_MAX_PCT, 104.5);
  assert.equal(clampDcsPvPercent(-10), -4.5);
  assert.equal(clampDcsPvPercent(104.5), 104.5);
  assert.equal(clampDcsPvPercent(110), 104.5);

  const upper = getDcsNormalizedSignals(220, 200, 0, 200);
  assert.equal(upper.rawPvPct, 110);
  assert.equal(upper.dcsPvPct, 104.5);
  assert.equal(upper.pvPct, 104.5);
  assert.equal(upper.dcsPvEngineering, 209);

  const lower = getDcsNormalizedSignals(-20, 0, 0, 200);
  assert.equal(lower.rawPvPct, -10);
  assert.equal(lower.dcsPvPct, -4.5);
  assert.equal(lower.dcsPvEngineering, -9);
});

test("DCS PV and SV signals use the DCS PV clamp and the PV range", () => {
  const signals = getDcsNormalizedSignals(120, 250, 0, 100);

  assert.equal(signals.rawPvPct, 120);
  assert.equal(signals.dcsPvPct, 104.5);
  assert.equal(signals.spPct, 100);
  assert.equal(signals.errorPct, -4.5);
});

test("all PID algorithms receive the same DCS PV after raw PV over-range", () => {
  const response = (pidAlgorithm, rawPv) => {
    const signals = getDcsNormalizedSignals(rawPv, 50, 0, 100);
    return computeVelocityPidDelta({
      dt: 0.5,
      pidAlgorithm,
      kc: 2,
      ti: 20,
      td: 2,
      errorPct: signals.errorPct,
      previousErrorPct: 0,
      previousDeltaErrorPct: 0,
      pvPct: signals.dcsPvPct,
      previousPvPct: 50,
      previousDeltaPvPct: 0,
    }).deltaMv;
  };

  for (const pidAlgorithm of ["PID", "PI_D", "I_PD"]) {
    assert.equal(response(pidAlgorithm, 104.5), response(pidAlgorithm, 120));
  }
});

test("error %Span reflects the same engineering deviation at each range", () => {
  assert.equal(normalizePidSignals(50, 60, 0, 100).errorPct, 10);
  assert.equal(normalizePidSignals(50, 60, 0, 200).errorPct, 5);
});

test("PI-D proportional response halves when the range doubles", () => {
  const response100 = firstResponse("PI_D", 50, 60, 0, 100);
  const response200 = firstResponse("PI_D", 50, 60, 0, 200);

  assert.equal(response100, 20);
  assert.equal(response200, 10);
  assert.equal(response100 / response200, 2);
});

test("equal %Span deviation produces equal PI-D response across ranges", () => {
  assert.equal(firstResponse("PI_D", 50, 60, 0, 100), firstResponse("PI_D", 100, 120, 0, 200));
});

test("default 0-100 range preserves the existing velocity equations", () => {
  const signals = normalizePidSignals(40, 60, 0, 100);
  const common = {
    dt: 0.5,
    kc: 2,
    ti: 20,
    td: 2,
    errorPct: signals.errorPct,
    previousErrorPct: 10,
    previousDeltaErrorPct: 2,
    pvPct: signals.pvPct,
    previousPvPct: 35,
    previousDeltaPvPct: 3,
  };
  const legacyInputs = {
    deltaError: 10,
    deltaPv: 5,
    delta2Error: 8,
    delta2Pv: 2,
    integralPart: 0.5,
  };

  assert.equal(
    computeVelocityPidDelta({ ...common, pidAlgorithm: "PID" }).deltaMv,
    2 * (legacyInputs.deltaError + legacyInputs.integralPart + 4 * legacyInputs.delta2Error),
  );
  assert.equal(
    computeVelocityPidDelta({ ...common, pidAlgorithm: "PI_D" }).deltaMv,
    2 * (legacyInputs.deltaError + legacyInputs.integralPart - 4 * legacyInputs.delta2Pv),
  );
  assert.equal(
    computeVelocityPidDelta({ ...common, pidAlgorithm: "I_PD" }).deltaMv,
    2 * (-legacyInputs.deltaPv + legacyInputs.integralPart - 4 * legacyInputs.delta2Pv),
  );
});

test("I-PD keeps P and D on PV rather than deviation", () => {
  const svStep = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "I_PD",
    kc: 2,
    ti: 0,
    td: 0,
    errorPct: 10,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: 50,
    previousPvPct: 50,
    previousDeltaPvPct: 0,
  });
  const pidSvStep = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "PID",
    kc: 2,
    ti: 0,
    td: 0,
    errorPct: 10,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: 50,
    previousPvPct: 50,
    previousDeltaPvPct: 0,
  });
  const pvStep = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "I_PD",
    kc: 2,
    ti: 0,
    td: 0,
    errorPct: -10,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: 60,
    previousPvPct: 50,
    previousDeltaPvPct: 0,
  });

  assert.equal(svStep.deltaMv, 0);
  assert.equal(pidSvStep.deltaMv, 20);
  assert.equal(pvStep.deltaMv, -20);
});

test("controller returns P/I/D term changes that preserve the velocity output", () => {
  const result = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "PID",
    kc: 2,
    ti: 20,
    td: 2,
    errorPct: 10,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: 50,
    previousPvPct: 50,
    previousDeltaPvPct: 0,
    previousPTerm: 0,
    previousITerm: 0,
    previousDTerm: 0,
  });

  assert.equal(result.pTerm, 20);
  assert.equal(result.iTerm, 0.5);
  assert.equal(result.dTerm, 80);
  assert.equal(result.deltaP, 20);
  assert.equal(result.deltaI, 0.5);
  assert.equal(result.deltaD, 80);
  assert.equal(result.deltaMv, result.deltaP + result.deltaI + result.deltaD);
});

test("the first stable calculation has zero contribution for every term", () => {
  const result = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "PID",
    kc: 2,
    ti: 20,
    td: 2,
    errorPct: 0,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: 50,
    previousPvPct: 50,
    previousDeltaPvPct: 0,
  });

  assert.equal(result.deltaP, 0);
  assert.equal(result.deltaI, 0);
  assert.equal(result.deltaD, 0);
});

test("I-PD SV step changes only the integral contribution while PV is fixed", () => {
  const result = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "I_PD",
    kc: 2,
    ti: 20,
    td: 2,
    errorPct: 10,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: 50,
    previousPvPct: 50,
    previousDeltaPvPct: 0,
  });

  assert.equal(result.deltaP, 0);
  assert.equal(result.deltaD, 0);
  assert.equal(result.deltaI, 0.5);
  assert.equal(result.deltaMv, result.deltaI);
});

test("I-PD PV response halves for the same engineering disturbance at double span", () => {
  const range100 = normalizePidSignals(60, 50, 0, 100);
  const range200 = normalizePidSignals(60, 50, 0, 200);
  const response100 = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "I_PD",
    kc: 2,
    ti: 0,
    td: 0,
    errorPct: range100.errorPct,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: range100.pvPct,
    previousPvPct: engineeringToPercent(50, 0, 100),
    previousDeltaPvPct: 0,
  }).deltaMv;
  const response200 = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "I_PD",
    kc: 2,
    ti: 0,
    td: 0,
    errorPct: range200.errorPct,
    previousErrorPct: 0,
    previousDeltaErrorPct: 0,
    pvPct: range200.pvPct,
    previousPvPct: engineeringToPercent(50, 0, 200),
    previousDeltaPvPct: 0,
  }).deltaMv;

  assert.equal(response100, -20);
  assert.equal(response200, -10);
  assert.equal(response100 / response200, 2);
});

test("invalid ranges never enter conversion", () => {
  assert.equal(isValidRange(0, 0), false);
  assert.equal(isValidRange(100, 0), false);
  assert.equal(isValidRange(Number.NaN, 100), false);
  assert.equal(Number.isNaN(engineeringToPercent(50, 0, 0)), true);
  assert.equal(Number.isNaN(percentToEngineering(50, 100, 0)), true);
});

test("synchronizing normalized history avoids a range-change delta", () => {
  const oldSignals = normalizePidSignals(50, 60, 0, 100);
  const newSignals = normalizePidSignals(50, 60, 0, 200);
  const delta = computeVelocityPidDelta({
    dt: 0.5,
    pidAlgorithm: "PID",
    kc: 2,
    ti: 0,
    td: 2,
    errorPct: newSignals.errorPct,
    previousErrorPct: newSignals.errorPct,
    previousDeltaErrorPct: 0,
    pvPct: newSignals.pvPct,
    previousPvPct: newSignals.pvPct,
    previousDeltaPvPct: 0,
  });

  assert.notEqual(oldSignals.errorPct, newSignals.errorPct);
  assert.equal(delta.deltaMv, 0);
});
