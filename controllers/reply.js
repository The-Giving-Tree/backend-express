const { body, validationResult } = require('express-validator/check');
const Post = require(__dirname + '/../models/post');
const Comment = require(__dirname + '/../models/comment');
const chalk = require('chalk');
const NewsFeed = require(__dirname + '/../models/newsfeed');
const User = require(__dirname + '/../models/user');
const Notification = require(__dirname + '/../models/notification');
const mongoose = require('mongoose');
var io = require(__dirname + '/../mysockets');
const sendNotification = require(__dirname + '/../util/notification');
const { userWithProfilePic } = require('../util/user-with-profile-pic');
const { sendEmail } = require('../util/send-email');

function antiSpam(user, author) {
  var diff = new Date() - new Date(user.createdAt);
  var diffdays = diff / 1000 / (60 * 60 * 24);

  // account must be 1 day old
  if (Number(diffdays) < 1 || user._id.toString() === author._id.toString()) {
    return false;
  }
  return true;
}

const findComment = (id, comments) => {
  if (comments.length > 0) {
    for (var index = 0; index < comments.length; index++) {
      const comment = comments[index];
      if (comment._id == id) {
        return comment;
      }
      const foundComment = findComment(id, comment.comments);
      if (foundComment) {
        return foundComment;
      }
    }
  }
};

const removeFromSet = (array, item) => {
  var set = array.reduce(function(map, obj) {
    map[obj] = true;
    return map;
  }, {});
  delete set[item];
  return Object.keys(set);
};

const addToSet = (array, item) => {
  var set = array.reduce(function(map, obj) {
    map[obj] = true;
    return map;
  }, {});

  // toggle
  if (set[item]) {
    delete set[item];
  } else {
    set[item] = true;
  }
  return Object.keys(set);
};

const findCommentParent = (id, comments, parentId = '') => {
  if (comments.length > 0) {
    for (var index = 0; index < comments.length; index++) {
      const comment = comments[index];
      if (comment._id.toString() == id.toString()) {
        return [parentId, comments];
      }
      const foundComment = findCommentParent(id, comment.comments, comment._id);
      if (foundComment) {
        return foundComment;
      }
    }
  }
};

const populateParent = async (postId, postParentId, newComment) => {
  try {
    let foundCommentParent = await Post.findById(postParentId);

    // comments is the current commend thread
    // parent is the parent comment or post of 'comments'
    // goal is to return the parent and the child comment
    var [parentId, comments] = await findCommentParent(postId, foundCommentParent.comments, 'post');

    let parent;
    if (parentId == 'post') {
      parent = foundCommentParent;
    } else {
      parent = findComment(parentId, foundCommentParent.comments);
    }

    // attach parent to child
    let commentObject = {
      type: 'Comment',
      voteTotal: newComment.voteTotal,
      upVotes: newComment.upVotes,
      downVotes: newComment.downVotes,
      children: newComment.children,
      comments: newComment.comments,
      _id: newComment._id,
      content: newComment.content,
      postId: newComment.postId,
      username: newComment.username,
      updatedAt: newComment.updatedAt,
      createdAt: newComment.createdAt,
      parent
    };

    if (foundCommentParent) {
      return commentObject;
    } else {
      return false;
    }
  } catch (err) {
    return false;
  }
};

exports.update = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = req.user;
    const postId = req.params.postId;
    const commentId = req.params.commentId;

    Post.findById(postId)
      .then(async post => {
        var comment = findComment(commentId, post.comments);
        if (!post || !comment) {
          return res.status(400).json({ message: `invalid postId or commentId` });
        }

        comment.content = req.body.newContent;
        comment.updatedAt = new Date();

        let commentModel = await Comment.findById(comment._id).exec();
        commentModel.content = req.body.newContent;
        commentModel.updatedAt = new Date();
        commentModel.save();

        post.markModified('comments');
        post.save();

        // populate parent
        let commentWithParent = await populateParent(comment._id, postId, comment);
        let parentId = '';
        if (commentWithParent.parent.type === 'Post') {
          parentId = commentWithParent.parent.authorId;
        } else if (commentWithParent.parent.type === 'Comment') {
          parentId = commentWithParent.parent.authorId;
        }

        let parentUser = User.findById(parentId).exec();

        sendNotification(parentUser, user, comment, 'Update');

        return res.status(200).send(commentWithParent);
      })
      .catch(err => {
        console.log('err: ', err);
        return res.status(401).send({ error: 'Invalid Post ID or Comment ID' });
      });
  } catch (err) {
    res.status(400).json(err);
  }
};

exports.upvote = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = req.user;
    const postId = req.params.postId;
    const commentId = req.params.commentId;

    Post.findById(postId)
      .then(async post => {
        var comment = findComment(commentId, post.comments);
        if (!post || !comment) {
          return res.status(400).json({ message: `invalid postId or commentId` });
        }

        // let previous = comment.upVotes;

        let contains = comment.upVotes.includes(user._id);
        comment.downVotes = removeFromSet(comment.downVotes, user._id);
        comment.upVotes = addToSet(comment.upVotes, user._id);
        comment.voteTotal = comment.upVotes.length - comment.downVotes.length;

        let commentModel = await Comment.findById(comment._id).exec();
        commentModel.downVotes = removeFromSet(commentModel.downVotes, user._id);
        commentModel.upVotes = addToSet(commentModel.upVotes, user._id);
        commentModel.voteTotal = commentModel.upVotes.length - commentModel.downVotes.length;
        commentModel.save();

        post.markModified('comments');
        post.save();

        // let after = comment.upVotes;
        let commentWithParent = await populateParent(comment._id, postId, comment);

        let commentAuthor = await User.findOne({ username: comment.username });

        if (antiSpam(user, commentAuthor)) {
          console.log(chalk.magenta('save ======== ', contains.toString()));

          commentAuthor.karma =
            Number(commentAuthor.karma) + Number(contains ? (commentAuthor.karma > 0 ? -1 : 0) : 1);
          await commentAuthor.save();
        }

        sendNotification(commentAuthor, user, comment, 'Upvote');

        return res.status(200).send(commentWithParent);
      })
      .catch(err => {
        console.log('err: ', err);
        return res.status(401).send({ error: 'Invalid Post ID or Comment ID' });
      });
  } catch (err) {
    res.status(400).json(err);
  }
};

exports.downvote = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = req.user;
    const postId = req.params.postId;
    const commentId = req.params.commentId;

    Post.findById(postId)
      .then(async post => {
        const comment = findComment(commentId, post.comments);
        if (!post || !comment) {
          return res.status(400).json({ message: `invalid postId or commentId` });
        }

        // let previous = comment.downVotes;
        let contains = comment.downVotes.includes(user._id);
        comment.downVotes = addToSet(comment.downVotes, user._id);
        comment.upVotes = removeFromSet(comment.upVotes, user._id);
        comment.voteTotal = comment.upVotes.length - comment.downVotes.length;

        let commentModel = await Comment.findById(comment._id).exec();
        commentModel.downVotes = addToSet(commentModel.downVotes, user._id);
        commentModel.upVotes = removeFromSet(commentModel.upVotes, user._id);
        commentModel.voteTotal = commentModel.upVotes.length - commentModel.downVotes.length;
        commentModel.save();

        post.markModified('comments');
        post.save();

        // let after = comment.downVotes;
        let commentWithParent = await populateParent(comment._id, postId, comment);

        let commentAuthor = await User.findOne({ username: comment.username });

        if (antiSpam(user, commentAuthor)) {
          commentAuthor.karma =
            Number(commentAuthor.karma) > 0
              ? Number(commentAuthor.karma) + Number(contains ? 1 : -1)
              : 0;
          await commentAuthor.save();
        }

        sendNotification(commentAuthor, user, comment, 'Downvote');

        return res.status(200).send(commentWithParent);
      })
      .catch(err => {
        console.log('downvote error: ', err);
        return res.status(401).send({ error: 'Invalid Post ID or Comment ID' });
      });
  } catch (err) {
    res.status(400).json(err);
  }
};

// recursive delete
const updateCommentAndNewsfeed = async comments => {
  console.log(chalk.green('start'));
  if (comments && comments.length > 0) {
    for (var i = 0; i < comments.length; i++) {
      let comment = comments[i];

      // delete current comment, check children after
      let commentModel = await Comment.find({ _id: comment._id }).exec();
      if (commentModel.length > 0) {
        commentModel.map(i => {
          console.log(chalk.magenta('commentModel: deleting ', i.content));
          i.remove();
        });
      } else {
        console.log(chalk.green('already deleted comment model'));
      }

      let newsItem = await NewsFeed.find({ postId: comment._id, deleted: false }).exec();
      if (newsItem.length > 0) {
        newsItem.map(async i => {
          console.log(chalk.magenta('News Feed: setting as deleted ', i._id));
          i.deleted = true;
          await i.save();
        });
      } else {
        console.log(chalk.green('already deleted news item'));
      }

      let notificationItem = await Notification.find({ postId: comment._id }).exec();
      if (notificationItem.length > 0) {
        notificationItem.map(async i => {
          console.log(chalk.magenta('Notification: deleting ', i._id));
          i.remove();
        });
      } else {
        console.log(chalk.green('already deleted notification'));
      }

      // check children
      if (comment.comments.length > 0) {
        console.log(chalk.yellow('going deeper into tree: ', comment.content));
        updateCommentAndNewsfeed(comment.comments);
      }
    }
  }
};

async function test() {
  // let n = await Notification.find({ postId: '5df6ddd5d2fabe00240b7f0b' }).exec();
  // if (n.length > 0) {
  //   n.map(async i => {
  //     console.log(chalk.magenta('Notification: deleting ', i));
  //     i.remove();
  //   });
  // }
  // let n = await Comment.find({ _id: '5df6ddd5d2fabe00240b7f0b' }).exec();
  // if (n.length > 0) {
  //   n.map(async i => {
  //     console.log(chalk.magenta('Comment: deleting ', i));
  //     i.remove();
  //   });
  // }
}

// test()

exports.delete = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const postId = req.params.postId;
    const commentId = req.params.commentId;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(422).json({ message: `post ${postId} doesn't exist` });
    }

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(422).json({ message: `comment ${commentId} doesn't exist` });
    }

    Post.findById(postId)
      .then(async post => {
        if (!post) {
          return res.status(422).json({ message: `post ${postId} doesn't exist` });
        }

        var [parentId, comments] = findCommentParent(commentId, post.comments, 'post');
        let parent;
        if (parentId == 'post') {
          parent = post;
        } else {
          parent = findComment(parentId, post.comments);
        }

        // update newsfeed and comment models (fast referenece)
        // VERY IMPORTANT
        console.log(chalk.green('deleting...'));
        let deleteComment = findComment(commentId, post.comments);
        console.log(chalk.green('delete comment: ', JSON.stringify(deleteComment, null, 4)));
        await updateCommentAndNewsfeed(deleteComment.comments);

        // resume normal deletion
        const deletedComments = comments.filter(comment => {
          return comment._id != commentId;
        });

        let foundComment = await Comment.findById(commentId);
        if (foundComment) {
          foundComment.remove();
        }

        // remove reference
        let foundNewsFeed = await NewsFeed.find({ postId: commentId, deleted: false }).exec();
        if (foundNewsFeed) {
          foundNewsFeed.map(async i => {
            i.deleted = true;
            await i.save();
          });
        }

        let foundNotification = await Notification.find({ postId: commentId }).exec();
        if (foundNotification) {
          foundNotification.map(i => {
            i.remove();
          });
        }

        // if no changes
        if (!foundComment && !foundNewsFeed && comments == deletedComments) {
          return res.status(422).json({ message: `invalid post or comment id (no deletion)` });
        }

        // only update post comments once done
        parent.comments = deletedComments;
        post.markModified('comments');

        // FIN

        await post.save();

        // just need
        return res.status(200).json({ _id: commentId, message: 'deleted successfully' });
      })
      .catch(err => {
        console.log('error: ', err);
        return res.status(401).send({ error: 'invalid post or comment id' });
      });
  } catch (err) {
    res.status(400).json(err);
  }
};

exports.createReply = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const { text } = req.body;

    const currentUser = req.user;
    const username = currentUser.username;

    const postId = req.params.postId;
    const commentId = req.params.commentId;

    Post.findById(postId)
      .then(async post => {
        const comment = findComment(commentId, post.comments);
        const date = new Date();

        const commentNew = await Comment.create({
          content: text,
          authorId: currentUser._id,
          postId,
          username,
          createdAt: date,
          updatedAt: date
        });

        // easy quick reference in future
        await NewsFeed.create({
          ownerId: currentUser._id,
          postId: commentNew._id,
          parentId: postId,
          content: text,
          type: 'Comment'
        });

        comment.comments.unshift(commentNew);
        post.markModified('comments');
        post.save();

        let commentAuthor = await User.findOne({ username: comment.username });

        // Send email to parent comment author
        const authorWithProfilePic = userWithProfilePic(currentUser);

        await sendEmail('reply', {
          recipient: commentAuthor,
          data: {
            comment: commentNew,
            ctaText: 'Reply Now',
            ctaLink:
              (process.env.NODE_ENV === 'PRODUCTION'
                ? 'https://www.givingtreeproject.org'
                : 'http://localhost:3001') +
              '/post/' +
              postId,
            author: authorWithProfilePic
          }
        });

        sendNotification(commentAuthor, currentUser, comment, 'Reply');

        return res.json(post);
      })
      .catch(err => {
        console.log('error: ', err);
        return res.status(401).send({ error: 'Invalid Post ID or Comment ID' });
      });
  } catch (err) {
    console.log('error: ', err);
    res.status(400).json(err);
  }
};

exports.validate = method => {
  switch (method) {
    case 'createReply': {
      return [body('text', `comment required`).exists()];
    }
  }
};
