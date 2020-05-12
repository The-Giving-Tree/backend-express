let FRONTEND_URL, BACKEND_URL;

switch (process.env.NODE_ENV) {
  case 'PRODUCTION':
    FRONTEND_URL = 'https://www.givingtreeproject.org';
    BACKEND_URL = 'https://api.givingtreeproject.org';
    break;
  case 'SANDBOX':
    FRONTEND_URL = 'https://staging.givingtreeproject.org';
    BACKEND_URL = 'https://api-staging.givingtreeproject.org';
    break;
  default:
    FRONTEND_URL = 'http://localhost:3001';
    BACKEND_URL = 'http://localhost:3000';
    break;
}

module.exports = {
  FRONTEND_URL,
  BACKEND_URL,
};
