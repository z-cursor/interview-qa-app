const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 支持 .md 文件作为文本资源导入
config.resolver.assetExts.push('md');
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'md');

// 添加 raw file transformer 处理 .md
config.transformer.assetPlugins = ['expo-asset/tools/hashAssetFiles'];

module.exports = config;
