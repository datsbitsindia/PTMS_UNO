module.exports = {
  apps: [
    {
      name: "ptms-uno-web",
      script: "app.js",
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    },
    {
      name: "ptms-uno-mcp",
      script: "mcp_service/main.py",
      cwd: "./",
      interpreter: "python",
      watch: false,
      env: {
        PORT: 8001,
        DB_NAME: "ptms_uno",
        TABLE_PREFIX: "uno_"
      }
    }
  ]
};
