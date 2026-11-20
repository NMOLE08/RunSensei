const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', '.tools/**', 'node_modules/**', 'coverage/**', 'supabase/functions/**'],
  },
]);
