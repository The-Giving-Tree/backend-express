const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongooseAlgolia = require('mongoose-algolia');
const Comment = require(__dirname + '/comment');

const postModel = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, default: 'Post' },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    startDate: { type: Date }, // when the request began
    endDate: { type: Date, default: null }, // completed date (null = not completed)
    categories: [{ type: String }],
    draft: { type: Boolean }, // if post is still in review
    published: { type: Boolean }, // if post is publically available
    username: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    abstract: {
      type: String
    },
    text: {
      type: String,
      required: true
    },
    tags: [
      {
        tag: {
          type: String
        }
      }
    ],
    loc: {
      type: {
        type: String,
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      }
    },
    completed: { type: Boolean, required: true, default: false },
    trackingDetails: {
      method: { type: String }, // postmates, text, etc
      customerId: { type: String }, // optional for 3rd party vendors
      deliveryId: { type: String }, // optional for 3rd party vendors
      created: { type: Date }, // when was order initiated
      updated: { type: Date }, // when was order updated
      dropoffEta: { type: String }, // string for the MVP
      notes: { type: String } // any notes from order (missing items, etc)
    },
    cancelTaskerReason: [
      { reason: { type: String }, user: { type: Schema.Types.ObjectId, ref: 'User' } }
    ],
    assignedUser: { type: Schema.Types.ObjectId, ref: 'User' },
    flagged: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }], // other Users can flag a post if it violates, after a certain number, the flagged content is manually reviewed
    voteTotal: { type: Number, default: 0 },
    upVotes: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    downVotes: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    comments: [Comment.schema],
    ratings: [{ type: Schema.Types.ObjectId, ref: 'Rating' }],
    rating: { type: Number },
    // new fields, to prevent JSON in 'text'
    address: { type: String, select: false },
    requestType: { type: String },
    description: { type: String },
    cart: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, default: 1 }
      }
    ],
    contactMethod: { type: String, required: true },
    email: { type: String, select: false },
    name: { type: String },
    dueDate: { type: Date },
    location: {
      type: {
        lat: { type: Number },
        lng: { type: Number }
      },
      select: false
    },
    postal: { type: String },
    phoneNumber: { type: String, select: false },
    publicAddress: { type: String }
  },
  {
    collection: 'Post'
  }
);

postModel.pre('save', function(next) {
  const date = new Date();
  this.updatedAt = date;
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

postModel.index({ loc: '2dsphere' });

postModel.plugin(mongooseAlgolia, {
  appId: process.env.ALGOLIA_APP_ID,
  apiKey: process.env.ALGOLIA_API_KEY,
  debug: true,
  indexName: function(doc) {
    return `post_${process.env.NODE_ENV}`;
  }
});

module.exports = mongoose.model('Post', postModel);
