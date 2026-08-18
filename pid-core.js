(() => {
  "use strict";

  function isValidRange(lrv, urv) {
    return Number.isFinite(lrv) && Number.isFinite(urv) && urv > lrv;
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
    computeVelocityPidDelta,
    engineeringToPercent,
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
