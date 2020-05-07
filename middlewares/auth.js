const jwt = require('jsonwebtoken');
const chalk = require('chalk');
const User = require(__dirname + '/../models/user');

const deleteToken = async expiredToken => {
  try {
    const user = await User.findOne({ 'tokens.token': expiredToken });
    user.tokens = user.tokens.filter(token => {
      return token.token != expiredToken;
    });
    await user.save();
  } catch (error) {
    console.log(`error while deleting token: ${error}`);
  }
};

const auth = async (req, res, next) => {
  if (!req.header('Authorization')) { return res.status(401).send(); }
  const token = req.header('Authorization').replace('Bearer ', '');

  try {
    const dateNow = new Date();
    const data = jwt.verify(token, process.env.JWT_KEY);
    const user = await User.findOne({ _id: data._id, 'tokens.token': token });
    if (!user || data.exp < dateNow.getTime() / 1000) {
      throw new Error();
    }
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    let errorResponse = { details: error, code: 401 };

    if (error.name === 'TokenExpiredError') {
      errorResponse.message = 'Expired token - please login again';
      await deleteToken(token);
    } else {
      errorResponse.message = 'Not authorized to access this resource';
    }

    return res.status(401).send(errorResponse);
    // return res.redirect('/login');
  }
};

module.exports = auth;
