
  import { createConfig }from '@nx/angular-rspack';
  
  
  export default createConfig({
    options: {
      root: __dirname,
      
  "outputPath": {
    "base": "../../dist/apps/web"
  },
  "index": "./src/index.html",
  "browser": "./src/main.ts",
  "tsConfig": "./tsconfig.app.json",
  "inlineStyleLanguage": "scss",
  "assets": [
    {
      "glob": "**/*",
      "input": "./public"
    }
  ],
  "styles": [
    "./src/styles.scss"
  ],
  "devServer": {},
  "ssr": {
    "entry": "./src/server.ts"
  },
  "server": "./src/main.server.ts",
  "prerender": {
    "discoverRoutes": true,
    "routes": [
      "/"
    ]
  },
  "security": {
    "allowedHosts": []
  }

    }
  }, {
      "production": {
        options: {
          
  "budgets": [
    {
      "type": "initial",
      "maximumWarning": "500kb",
      "maximumError": "1mb"
    },
    {
      "type": "anyComponentStyle",
      "maximumWarning": "4kb",
      "maximumError": "8kb"
    }
  ],
  "outputHashing": "all",
  "devServer": {},
  "prerender": {
    "discoverRoutes": true,
    "routes": []
  }

        }
      },

      "development": {
        options: {
          
  "optimization": false,
  "vendorChunk": true,
  "extractLicenses": false,
  "sourceMap": true,
  "namedChunks": true,
  "devServer": {},
  "prerender": {
    "discoverRoutes": true,
    "routes": []
  }

        }
      }});