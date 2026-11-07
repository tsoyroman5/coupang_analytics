const { NxAppWebpackPlugin } = require("@nx/webpack/app-plugin");
const { join, resolve } = require("path");
const path = require("path");
const nodeExternals = require("webpack-node-externals");

module.exports = {
  output: {
    path: join(__dirname, "../../dist/apps/api"),
    clean: true,
    ...(process.env.NODE_ENV !== "production" && {
      devtoolModuleFilenameTemplate: "[absolute-resource-path]",
    }),
  },
  externals: [
    nodeExternals({
      modulesDir: path.resolve(__dirname, "../../node_modules"),
    }),
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: "node",
      compiler: "tsc",
      main: "./src/main.ts",
      tsConfig: "./tsconfig.app.json",
      assets: ["./src/assets"],
      optimization: false,
      outputHashing: "none",
      generatePackageJson: true,
      sourceMap: true,
      externalDependencies: "all",
      additionalEntryPoints: [
        { entryName: "cli", entryPath: "apps/api/src/cli.ts" },
      ],
    }),
    {
      apply(compiler) {
        compiler.options.externals = [
          nodeExternals({
            modulesDir: resolve(__dirname, "../../node_modules"),
          }),
        ];
        compiler.options.externalsPresets = { node: true };
      },
    },
  ],
};
