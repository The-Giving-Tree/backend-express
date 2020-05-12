const urls = require('./util/urls');

const config = {
  "defaults": {
    "origin": urls.BACKEND_URL,
    "transport": "session",
    "state": true,
    "prefix": "/v1/auth/oauth",
    "callback": "/v1/auth/handler"
  },
  "google": {
    "key": "87844400482-2hprrqupkhvvm1vr8nds5gk8ogknc64v.apps.googleusercontent.com",
    "secret": process.env.OAUTH_GOOGLE_SECRET,
    "scope": ['openid', 'profile', "email"],
    "nonce": true
  }
};

module.exports = config;
