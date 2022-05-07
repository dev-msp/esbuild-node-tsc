#!/usr/bin/env node

import ts, { BuildOptions } from "typescript";
import { build } from "esbuild";
import cpy from "cpy";
import path from "path";
import rimraf from "rimraf";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { Config, ArgsConfig, readUserConfig } from "./config";

const cwd = process.cwd();
const { argv }: { argv: ArgsConfig | Promise<ArgsConfig> } = yargs(
  hideBin(process.argv)
)
  .option("config", {
    describe: "path to config file",
    type: "string",
    default: "etsc.config.js",
    coerce: (configFileName: string) => path.resolve(cwd, configFileName),
  })
  .option("clean", {
    describe: "clean output directory before build",
    type: "boolean",
  })
  .option("silent", {
    describe: "suppress log output",
    type: "boolean",
  });

function getTSConfig(_tsConfigFile = "tsconfig.json") {
  const tsConfigFile = ts.findConfigFile(cwd, ts.sys.fileExists, _tsConfigFile);
  if (!tsConfigFile) {
    throw new Error(`tsconfig.json not found in the current directory! ${cwd}`);
  }
  const configFile = ts.readConfigFile(tsConfigFile, ts.sys.readFile);
  const tsConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    cwd
  );
  return { tsConfig, tsConfigFile };
}

type TSConfig = ReturnType<typeof getTSConfig>["tsConfig"];

function esBuildSourceMapOptions(tsConfig: TSConfig) {
  const { sourceMap, inlineSources, inlineSourceMap } = tsConfig.options;

  // inlineSources requires either inlineSourceMap or sourceMap
  if (inlineSources && !inlineSourceMap && !sourceMap) {
    return false;
  }

  // Mutually exclusive in tsconfig
  if (sourceMap && inlineSourceMap) {
    return false;
  }

  if (inlineSourceMap) {
    return "inline";
  }

  return sourceMap;
}

function getBuildMetadata(userConfig: Config) {
  const { tsConfig, tsConfigFile } = getTSConfig(userConfig.tsConfigFile);

  const outDir = userConfig.outDir || tsConfig.options.outDir || "dist";

  const esbuildEntryPoints = userConfig.esbuild?.entryPoints || [];
  const srcFiles = [...tsConfig.fileNames, ...esbuildEntryPoints];
  const sourcemap = esBuildSourceMapOptions(tsConfig);
  const target =
    userConfig.esbuild?.target ||
    tsConfig?.raw?.compilerOptions?.target ||
    "es6";
  const minify = userConfig.esbuild?.minify || false;
  const plugins = userConfig.esbuild?.plugins || [];
  const format = userConfig.esbuild?.format || "cjs";

  const esbuildOptions: BuildOptions = {
    outdir: outDir,
    entryPoints: srcFiles,
    sourcemap,
    target,
    minify,
    plugins,
    tsconfig: tsConfigFile,
    format,
  };

  const assetPatterns = userConfig.assets?.filePatterns || ["**"];

  const assetsOptions = {
    baseDir: userConfig.assets?.baseDir || "src",
    outDir: userConfig.assets?.outDir || outDir,
    patterns: [...assetPatterns, `!**/*.{ts,js,tsx,jsx}`],
  };

  return { outDir, esbuildOptions, assetsOptions };
}

async function buildSourceFiles(esbuildOptions: Partial<BuildOptions>) {
  return await build({
    bundle: false,
    format: "cjs",
    platform: "node",
    ...esbuildOptions,
  });
}

type AssetsOptions = { baseDir: string; outDir: string; patterns: string[] };

async function copyNonSourceFiles({
  baseDir,
  outDir,
  patterns,
}: AssetsOptions) {
  const relativeOutDir = path.relative(baseDir, outDir);
  return await cpy(patterns, relativeOutDir, {
    cwd: baseDir,
  });
}

async function main() {
  const config = readUserConfig(await argv);
  const { outDir, esbuildOptions, assetsOptions } = getBuildMetadata(config);

  if (config.clean) {
    rimraf.sync(outDir);
  }

  if (!config.silent) {
    console.time("Built in");
  }
  await Promise.all([
    buildSourceFiles(esbuildOptions),
    copyNonSourceFiles(assetsOptions),
  ]);

  return config;
}

main()
  .then(({ silent }) => {
    if (!silent) {
      console.timeEnd("Built in");
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
