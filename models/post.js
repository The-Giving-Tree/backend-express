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
    startDate: { type: Date }, // when the research began
    endDate: { type: Date, default: null }, // when the research finished (null = ongoing)
    categories: [{ type: String, required: true }],
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
      type: { type: String },
      coordinates: []
    },
    completed: { type: Boolean, required: true, default: false },
    assignedUser: { type: Schema.Types.ObjectId, ref: 'User' },
    flagged: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }], // other Users can flag a post if it violates, after a certain number, the flagged content is manually reviewed
    voteTotal: { type: Number, default: 0 },
    upVotes: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    downVotes: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    comments: [Comment.schema],
    ratings: [{ type: Schema.Types.ObjectId, ref: 'Rating' }],
    rating: { type: Number }
  },
  {
    collection: 'Post'
  }
);

postModel.index({ loc: '2dsphere' });

postModel.pre('save', function(next) {
  const date = new Date();
  this.updatedAt = date;
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

postModel.plugin(mongooseAlgolia, {
  appId: process.env.ALGOLIA_APP_ID,
  apiKey: process.env.ALGOLIA_API_KEY,
  debug: true,
  indexName: function(doc) {
    return `post_${process.env.NODE_ENV}`;
  }
});

module.exports = mongoose.model('Post', postModel);
