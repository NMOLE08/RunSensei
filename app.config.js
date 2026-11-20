const base = require('./app.json').expo;

module.exports = () => ({
  ...base,
  extra: {
    ...base.extra,
    internalResearchBuild: process.env.TORTO_INTERNAL_RESEARCH_BUILD === 'true',
    // This is intentionally separate from the broader research build switch.
    // It only permits the opt-in GPS diagnostic controls in a specifically
    // produced internal APK.
    internalGpsDiagnosticBuild: process.env.TORTO_INTERNAL_GPS_DIAGNOSTIC_BUILD === 'true',
  },
});
