const { createProxyMiddleware } = require("http-proxy-middleware");

// Só a API vai para o backend. O `proxy` do package.json encaminhava qualquer
// request sem Accept: text/html, o que quebrava deep links do funil
// (/calculadora, /bonus) para curl, bots e link preview.
module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000",
      changeOrigin: true,
      xfwd: true,
    })
  );
};
