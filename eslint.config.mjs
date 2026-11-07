import nx from "@nx/eslint-plugin";

export default [
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  {
    ignores: ["**/dist", "**/out-tsc", "**/vitest.config.*.timestamp*"],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          allow: ["^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"],
          depConstraints: [
            // scope: who may import whom
            {
              sourceTag: "scope:web",
              onlyDependOnLibsWithTags: ["scope:web", "scope:shared"],
              bannedExternalImports: [
                "@nestjs/*",
                "drizzle-orm",
                "pg",
                "express",
              ],
            },
            {
              sourceTag: "scope:api",
              onlyDependOnLibsWithTags: ["scope:api", "scope:shared"],
              bannedExternalImports: ["@angular/*"],
            },
            {
              sourceTag: "scope:shared",
              onlyDependOnLibsWithTags: ["scope:shared"],
              bannedExternalImports: ["@angular/*", "@nestjs/*", "rxjs"],
            },
            // type: layering
            {
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: [
                "type:feature",
                "type:data-access",
                "type:ui",
                "type:util",
              ],
            },
            { sourceTag: "type:util", onlyDependOnLibsWithTags: ["type:util"] },
          ],
        },
      ],
    },
  },
  {
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.cts",
      "**/*.mts",
      "**/*.js",
      "**/*.jsx",
      "**/*.cjs",
      "**/*.mjs",
    ],
    // Override or add rules here
    rules: {},
  },
];
