// app.config.ts
import { defineConfig } from "@tanstack/start/config";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
var app_config_default = defineConfig({
  vite: {
    plugins: [
      TanStackRouterVite({
        routesDirectory: "./app/routes",
        generatedRouteTree: "./app/routeTree.gen.ts"
      })
    ]
  },
  server: {
    preset: "node-server"
  }
});
export {
  app_config_default as default
};
