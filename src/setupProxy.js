const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api/yahoo',
    createProxyMiddleware({
      target: 'https://query2.finance.yahoo.com',
      changeOrigin: true,
      pathRewrite: { '^/api/yahoo': '' },
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
        proxyReq.setHeader('Accept', 'application/json');
      },
    })
  );
};
