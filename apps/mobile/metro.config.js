const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("@react-native/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    disableHierarchicalLookup: true,
    extraNodeModules: {
      react: path.resolve(projectRoot, "node_modules/react"),
      "react-native": path.resolve(projectRoot, "node_modules/react-native")
    },
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
      path.resolve(workspaceRoot, "node_modules")
    ]
  }
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
