const express = require('express');
require('dotenv').config();
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const expressValidator = require('express-validator');
const Sentry = require('@sentry/node');
const chalk = require('chalk');
const cors = require('cors');
// const redis = require('redis');
// const client = redis.createClient();
const PROD = process.env.NODE_ENV === 'PRODUCTION';
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200
});

const app = express();

app.use(limiter);
app.use(expressValidator());
app.use(cors());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

const dbUrl = PROD ? process.env.GIVING_TREE_PROD_DB : process.env.GIVING_TREE_SANDBOX_DB;
const db = mongoose
  .connect(dbUrl, {
    useNewUrlParser: true,
    autoIndex: false,
    useFindAndModify: false
  })
  .then(
    () => {
      console.log(`Database connected with prod bool ${PROD}`);
    },
    err => {
      console.log('ERROR DB: ', err);
    }
  );

const routes = require('./routes/index');
const postV1 = require('./routes/v1/posts');
const userV1 = require('./routes/v1/users');
const commentV1 = require('./routes/v1/comments');
const repliesV1 = require('./routes/v1/replies');
const statsV1 = require('./routes/v1/stats');
const emailFeedbackV1 = require('./routes/v1/email-feedback');

app.use('/', routes);
app.use('/v1/post', postV1);
app.use('/v1/user', userV1);
app.use('/v1/post', commentV1);
app.use('/v1/post', repliesV1);
app.use('/v1/stats', statsV1);
app.use('/v1/email-feedback', emailFeedbackV1);

app.use(function(req, res, next) {
  if (!req.route) return res.status(404).json({ error: '404 Route Not Found' });
  next();
});

app.use(function(err, req, res, next) {
  res.send(err);
});

const port = process.env.PORT || 9999;

const server = require('http').createServer(app);
var io = require('./mysockets').listen(server);

server.listen(port);

function print(path, layer) {
  if (layer.route) {
    layer.route.stack.forEach(print.bind(null, path.concat(split(layer.route.path))));
  } else if (layer.name === 'router' && layer.handle.stack) {
    layer.handle.stack.forEach(print.bind(null, path.concat(split(layer.regexp))));
  } else if (layer.method) {
    console.log(
      '%s /%s',
      layer.method.toUpperCase(),
      chalk.green(
        path
          .concat(split(layer.regexp))
          .filter(Boolean)
          .join('/')
      )
    );
  }
}

function split(thing) {
  if (typeof thing === 'string') {
    return thing.split('/');
  } else if (thing.fast_slash) {
    return '';
  } else {
    var match = thing
      .toString()
      .replace('\\/?', '')
      .replace('(?=\\/|$)', '$')
      .match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//);
    return match
      ? match[1].replace(/\\(.)/g, '$1').split('/')
      : '<complex:' + thing.toString() + '>';
  }
}

app._router.stack.forEach(print.bind(null, []));

module.exports = app;
