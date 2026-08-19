(() => {
  "use strict";

  const DCS_PV_MIN_PCT = -4.5;
  const DCS_PV_MAX_PCT = 104.5;

  function isValidRange(lrv, urv) {
    return Number.isFinite(lrv) && Number.isFinite(urv) && urv > lrv;
  }

  function clampPercent(value, min, max) {
    if (!Number.isFinite(value)) return Number.NaN;
    return Math.min(max, Math.max(min, value));
  }

  function clampDcsPvPercent(value) {
    return clampPercent(value, DCS_PV_MIN_PCT, DCS_PV_MAX_PCT);
  }

  function engineeringToPercent(value, lrv, urv) {
    if (!Number.isFinite(value) || !isValidRange(lrv, urv)) return Number.NaN;
    return (100 * (value - lrv)) / (urv - lrv);
  }

  function percentToEngineering(percent, lrv, urv) {
    if (!Number.isFinite(percent) || !isValidRange(lrv, urv)) return Number.NaN;
    return lrv + (percent / 100) * (urv - lrv);
  }

  function normalizePidSignals(pv, sp, lrv, urv) {
    const pvPct = engineeringToPercent(pv, lrv, urv);
    const spPct = engineeringToPercent(sp, lrv, urv);
    return {
      pvPct,
      spPct,
      errorPct: spPct - pvPct,
    };
  }

  function getRawNormalizedSignals(pv, sp, lrv, urv) {
    const signals = normalizePidSignals(pv, sp, lrv, urv);
    return {
      rawPvPct: signals.pvPct,
      rawSpPct: signals.spPct,
      pvPct: signals.pvPct,
      spPct: signals.spPct,
      errorPct: signals.errorPct,
    };
  }

  function getDcsNormalizedSignals(pv, sp, lrv, urv) {
    const rawSignals = getRawNormalizedSignals(pv, sp, lrv, urv);
    const dcsPvPct = clampDcsPvPercent(rawSignals.rawPvPct);
    const spPct = clampPercent(rawSignals.rawSpPct, 0, 100);
    return {
      rawPvPct: rawSignals.rawPvPct,
      rawSpPct: rawSignals.rawSpPct,
      pvPct: dcsPvPct,
      dcsPvPct,
      spPct,
      errorPct: spPct - dcsPvPct,
      dcsPvEngineering: percentToEngineering(dcsPvPct, lrv, urv),
    };
  }

  function computeVelocityPidDelta(params) {
    const {
      dt,
      pidAlgorithm,
      kc,
      ti,
      td,
      errorPct,
      previousErrorPct,
      previousDeltaErrorPct,
      pvPct,
      previousPvPct,
      previousDeltaPvPct,
    } = params;
    const deltaErrorPct = errorPct - previousErrorPct;
    const deltaPvPct = pvPct - previousPvPct;
    const delta2ErrorPct = deltaErrorPct - previousDeltaErrorPct;
    const delta2PvPct = deltaPvPct - previousDeltaPvPct;
    const integralPart = ti > 0 ? (dt / ti) * errorPct : 0;

    let deltaMv;
    switch (pidAlgorithm) {
      case "PID":
        deltaMv = kc * (deltaErrorPct + integralPart + (td / dt) * delta2ErrorPct);
        break;
      case "PI_D":
        deltaMv = kc * (deltaErrorPct + integralPart - (td / dt) * delta2PvPct);
        break;
      case "I_PD":
      default:
        deltaMv = kc * (-deltaPvPct + integralPart - (td / dt) * delta2PvPct);
        break;
    }

    return {
      deltaMv,
      deltaErrorPct,
      deltaPvPct,
    };
  }

  const api = Object.freeze({
    DCS_PV_MAX_PCT,
    DCS_PV_MIN_PCT,
    clampDcsPvPercent,
    computeVelocityPidDelta,
    engineeringToPercent,
    getDcsNormalizedSignals,
    getRawNormalizedSignals,
    isValidRange,
    normalizePidSignals,
    percentToEngineering,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.PIDLoopCore = api;
  }
})();
