const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');
const jwt = require('jsonwebtoken');
require('mongoose-type-url');
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt');
const SALT_WORK_FACTOR = 10;
const mongooseAlgolia = require('mongoose-algolia');

const userModel = new Schema(
  {
    name: { type: String },
    resetToken: { type: String },
    organization: { type: Boolean }, // if the user is a registered institution
    verified: { type: Boolean }, // if the user has been independently verified
    email: { type: String, unique: true, lowercase: true, required: true },
    summary: { type: String },
    username: { type: String, required: true, lowercase: true, unique: true },
    password: { type: String, required: true },
    karma: { type: Number, default: 0 },
    verified: { type: Boolean },
    expert: { type: Boolean }, // similar to Yelp Elite's: experts are qualified people in industry who have been vetted and can provide good feedback
    createdAt: { type: Date },
    sessionId: { type: String }, // for socket connections
    seenSubmitTutorial: { type: Boolean, default: false }, // to show user tutorial about submitting new articles
    welcomeTutorial: { type: Boolean, default: false }, // tutorial to show user around app
    stripeCustomerId: { type: String, unique: true },
    url: { type: mongoose.SchemaTypes.Url },
    balanceUSD: { type: Number, default: 0 },
    headerPictureUrl: {
      type: mongoose.SchemaTypes.Url,
      default: 'https://s3.amazonaws.com/pan.gaea/giving_tree.jpg'
    },
    profilePictureUrl: {
      type: mongoose.SchemaTypes.Url,
      default: 'https://s3.amazonaws.com/pan.gaea/acacia.svg'
    },
    donations: [{ type: Schema.Types.ObjectId, ref: 'donation', required: true }],
    tokens: [
      {
        token: {
          type: String,
          required: true
        }
      }
    ]
  },
  {
    collection: 'User'
  }
);

userModel.plugin(uniqueValidator);

userModel.pre('save', function(next) {
  const user = this;

  const date = new Date();
  if (!this.createdAt) {
    this.createdAt = date;
  }

  if (!this.summary) {
    this.summary = '';
  }

  // only hash the password if it has been modified (or is new)
  if (!user.isModified('password')) return next();

  // generate a salt
  bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
    if (err) return next(err);

    // hash the password using our new salt
    bcrypt.hash(user.password, salt, function(err, hash) {
      if (err) return next(err);

      // override the cleartext password with the hashed one
      user.password = hash;
      next();
    });
  });
});

userModel.plugin(mongooseAlgolia, {
  appId: process.env.ALGOLIA_APP_ID,
  apiKey: process.env.ALGOLIA_API_KEY,
  debug: true,
  indexName: function(doc) {
    return `user_${process.env.NODE_ENV}`;
  }
});

userModel.methods.generateAuthToken = async function(rememberMe) {
  // Generate an auth token for the user
  const user = this;
  const token = jwt.sign({ _id: user._id }, process.env.JWT_KEY, {
    expiresIn: rememberMe ? '7d' : '2h'
  });
  user.tokens = user.tokens.concat({ token });
  await user.save();
  return token;
};

userModel.methods.generateResetToken = async function() {
  const user = this;
  const token = require('crypto')
    .randomBytes(32)
    .toString('hex');
  user.resetToken = token;
  await user.save();
  return token;
};

userModel.methods.comparePassword = function(candidatePassword, cb) {
  bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
    if (err) return cb(err);
    cb(null, isMatch);
  });
};

module.exports = mongoose.model('User', userModel);
