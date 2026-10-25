const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// 只在当前项目目录中解析模块，不向上查找 monorepo root
config.watchFolders = [projectRoot];

// 确保 Metro 只使用当前项目的 node_modules
config.resolver = config.resolver || {};
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
];

module.exports = config;
