const express = require('express');
const grant = require('grant-express');
const profile = require('grant-profile');
const session = require('express-session');

const authConfig = require('../../auth-config');
const User = require('../../models/user');
const urls = require('../../util/urls');

const authRouter = express.Router();

authRouter
  .use(session({ secret: 'grant', saveUninitialized: true, resave: false }))
  .use((req, res, next) => {
    // If we navigate here with a username, we are signing up
    if (req.query.username) {
      req.session.username = req.query.username;
    }

    next();
  })
  .use(
    grant({
      config: authConfig,
      extend: [profile]
    })
  );

authRouter.get('/handler', async (req, res) => {
  if (!req.session || !req.session.grant || !req.session.grant.response) {
    return res.json({});
  }

  const { profile } = req.session.grant.response;
  const { provider } = req.session.grant;

  if (!profile || !profile.email) {
    return redirectWithError(res, 'No email was returned. Ensure that you granted us permission.');
  }

  const response = {
    profile,
    provider,
    username: req.session.username
  };

  if (response.username) {
    // New user
    const signup = await handleSignup(response);

    // TODO: Implement signup
    return redirectWithError(res, 'We currently only support oauth for pre-existing users, not new registrations.');
  } else {
    // Login
    try {
      const { accessToken } = await handleLogin(response);

      res.redirect(`${urls.FRONTEND_URL}/oauth?accessToken=${accessToken}`);
    } catch (e) {
      console.error(e);
      return redirectWithError(res, e);
    }
  }
});

const handleSignup = async authResponse => {};
const handleLogin = async authResponse => {
  // Try and find user
  const { email } = authResponse.profile;
  const user = await User.findOne({ email });

  if (!user) {
    throw new Error('User account with this email not found');
  }

  const accessToken = await user.generateAuthToken(true);

  return {
    accessToken
  };
};
const redirectWithError = (res, errorMessage) => {
  res.redirect(`${urls.FRONTEND_URL}/oauth?errorMessage=${encodeURIComponent(errorMessage)}`);
};

module.exports = authRouter;
