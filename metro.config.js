const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Fix Supabase OpenTelemetry dynamic import issue in Metro bundler
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ["react-native", "node", "require"];

// Add empty resolver for OTEL_PKG that Metro can't resolve
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@opentelemetry/api": require.resolve("./node_modules/expo/AppEntry.js"),
};

// Allow optional dependencies in the transformer
config.transformer.allowOptionalDependencies = true;

module.exports = config;