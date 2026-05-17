// Vercel serverless entry point — imports pre-built NestJS handler from dist/
module.exports = require('../dist/src/serverless').default;
