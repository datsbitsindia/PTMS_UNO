module.exports = {
  apps: [
    {
      name: "tva-web",
      script: "app.js",
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    },
    {
      name: "tva-mcp",
      script: "mcp_service/main.py",
      cwd: "./",
      interpreter: "python",
      watch: false,
      env: {
        PORT: 8001,
        DB_NAME: "tva_db",
        TABLE_PREFIX: "tva_"
      }
    }
  ]
};
