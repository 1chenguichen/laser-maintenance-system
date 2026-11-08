const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.REACT_APP_API_BASE || 'http://localhost:8080',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '', // 移除 /api 前缀
      },
    })
  );
};
