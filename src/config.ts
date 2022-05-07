import fs from "fs";
import type { Plugin } from "esbuild";

export type ArgsConfig = {
  config: string;
  clean?: boolean;
  silent?: boolean;
};

export type Config = Partial<{
  outDir: string;
  clean?: boolean;
  silent?: boolean;
  tsConfigFile?: string;
  esbuild: {
    entryPoints?: string[];
    minify?: boolean;
    target?: string;
    plugins?: Plugin[];
    format?: "cjs" | "esm";
  };
  assets: {
    baseDir?: string;
    outDir?: string;
    filePatterns?: string[];
  };
}>;

export function readUserConfig(args: ArgsConfig): Config {
  const { config: configPath, silent, clean } = args;
  let configFromFile = {};
  if (fs.existsSync(configPath)) {
    try {
      configFromFile = require(configPath);
    }
    catch (e) {
      if (silent) {
        throw e
      }
      console.log("Config file has some errors:");
      console.error(e);
      console.log("Using default config");
    }
  } else if (!silent) {
    console.log(
      `Config file '${configPath}' does not exist, using default config`
    );
  }
  return { ...configFromFile, clean, silent };
}
