const express = require('express');
const chalk = require('chalk');
const postRouter = express.Router();
const auth = require(__dirname + '/../../middlewares/auth');
const postController = require(__dirname + '/../../controllers/post');
const Post = require(__dirname + '/../../models/post');
const User = require(__dirname + '/../../models/user');
const NewsFeed = require(__dirname + '/../../models/newsfeed');
const Notification = require(__dirname + '/../../models/notification');
var io = require(__dirname + '/../../mysockets');
const sendNotification = require(__dirname + '/../../util/notification');
const { userWithProfilePic } = require('../../util/user-with-profile-pic');
const { sendEmail } = require('../../util/send-email');

const getPosts = () => {
  return Post.find().populate('authorId', '-email');
};

const getPost = id => {
  return Post.findOne({ _id: id })
    .populate('authorId', '-email')
    .exec();
};

const getDraft = (id, user) => {
  return Post.findOne({ _id: id, authorId: user._id }).populate('authorId', '-email');
};

const removePost = (_id, user) => {
  return Post.remove({ _id, author: user });
};

postRouter.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    let post = await Post.findOne({ _id: id })
      .populate('authorId', '-email')
      .exec();
    if (!post) {
      return res.status(401).send({ message: `Post doesn't exist anymore` });
    }

    console.log('post: ', post);

    return res.json(post);
  } catch (err) {
    res.status(401).send({ message: `Error finding post: ${err}` });
  }
});

postRouter.get('/draft/:id', auth, (req, res) => {
  const id = req.params.id;

  getDraft(id, req.user)
    .then(draft => {
      if (!draft) {
        return res.status(401).send({ message: `Draft doesn't exist` });
      } else if (draft.published) {
        // draft needs to redirect
        return res.status(400).send({ message: `Draft is already published` });
      }

      return res.json(draft);
    })
    .catch(err => {
      res.status(401).send({ message: `Error finding draft: ${err}` });
    });
});

postRouter.delete(
  '/:postId',
  auth,
  postController.validate('deletePost'),
  postController.deletePost
);

postRouter.post('/new', auth, postController.validate('createDraft'), postController.createDraft);

postRouter.put(
  '/save/:postId',
  auth,
  postController.validate('saveDraft'),
  postController.saveDraft
);

// edit post
postRouter.put('/:postId', auth, postController.validate('editPost'), postController.editPost);

postRouter.post('/publish/:postId', auth, postController.publishPost);

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

postRouter.put('/:postId/complete', auth, async (req, res) => {
  const user = req.user;
  try {
    let post = await Post.findOne({ _id: req.params.postId })
      .populate('assignedUser', 'name username email karma createdAt profilePictureUrl')
      .exec();
    if (!post) {
      return res.status(400).json({ message: `invalid postId` });
    }

    post.completed = true;
    post.endDate = new Date();

    // optional params
    if (req.body.method) {
      post.trackingDetails.method = req.body.method;
    }

    if (req.body.customerId) {
      post.trackingDetails.customerId = req.body.customerId;
    }

    if (req.body.created) {
      post.trackingDetails.created = req.body.created;
    }

    if (req.body.deliveryId) {
      post.trackingDetails.deliveryId = req.body.deliveryId;
    }

    if (req.body.dropoffEta) {
      post.trackingDetails.dropoffEta = req.body.dropoffEta;
    }

    if (req.body.notes) {
      post.trackingDetails.notes = req.body.notes;
    }

    post.save();

    let postAuthor = await User.findById(post.authorId).exec();
    let assignedUser = await User.findById(post.assignedUser).exec();

    let currentCompletedTasks = postAuthor.completedTasks ? postAuthor.completedTasks : 0;
    postAuthor.completedTasks = currentCompletedTasks + 1;

    if (assignedUser) {
      assignedUser.karma = Number(assignedUser.karma) + 2;
      await assignedUser.save();
    }

    await postAuthor.save();

    sendNotification(postAuthor, req.user, post, 'Complete');

    return res.status(200).send(post);
  } catch (err) {
    return res.status(401).send({ error: `Error when completing order: ${err}` });
  }
});

postRouter.put('/:postId/claim', auth, async (req, res) => {
  const user = req.user;
  Post.findById(req.params.postId)
    .then(async post => {
      if (!post) {
        return res.status(400).json({ message: `invalid postId` });
      }

      if (post.completed) {
        return res.status(400).json({ message: `task is already completed` });
      }

      if (post.assignedUser) {
        return res
          .status(400)
          .json({ message: `task is already assigned to a user - please try a different task` });
      }

      post.assignedUser = user._id;

      post.save();

      let postAuthor = await User.findById(post.authorId).exec();

      sendNotification(postAuthor, req.user, post, 'Claim');

      const claimant = userWithProfilePic(req.user);
      await sendEmail('request-claimed', {
        recipient: postAuthor,
        data: {
          ctaText: `View ${claimant.name}'s Profile`,
          ctaLink:
            (process.env.NODE_ENV === 'PRODUCTION'
              ? 'https://www.givingtreeproject.org'
              : 'http://localhost:3001') +
            '/user/' +
            claimant.username,
          author: claimant
        }
      });

      return res.status(200).send(post);
    })
    .catch(err => {
      return res.status(401).send({ error: `Error when claiming order: ${err}` });
    });
});

postRouter.put('/:postId/unclaim', auth, async (req, res) => {
  const user = req.user;
  Post.findById(req.params.postId)
    .then(async post => {
      if (!post) {
        return res.status(400).json({ message: `invalid postId` });
      }

      if (post.completed) {
        return res.status(400).json({ message: `task is already completed` });
      }

      if (!req.body.reason || req.body.reason === '') {
        return res.status(400).json({ message: `reason cannot be empty` });
      }

      if (post.assignedUser.toString() !== user._id.toString()) {
        return res.status(400).json({ message: `you cannot unclaim a different user's task` });
      } else {
        // only if assigned user === the user
        post.assignedUser = undefined;
        let cancelObject = { reason: req.body.reason, user: user._id };
        post.cancelTaskerReason.push(cancelObject);

        post.save();

        let postAuthor = await User.findById(post.authorId).exec();

        let currentCancelledTasks = postAuthor.cancelledTasks ? postAuthor.cancelledTasks : 0;
        postAuthor.cancelledTasks = currentCancelledTasks + 1;

        postAuthor.save();

        sendNotification(postAuthor, req.user, post, 'Unclaim');

        return res.status(200).send(post);
      }
    })
    .catch(err => {
      return res.status(401).send({ error: `Error when unclaiming order: ${err}` });
    });
});

function antiSpam(user, author) {
  var diff = new Date() - new Date(user.createdAt);
  var diffdays = diff / 1000 / (60 * 60 * 24);

  // account must be 1 day old
  if (Number(diffdays) < 1 || user._id.toString() === author._id.toString()) {
    return false;
  }
  return true;
}

postRouter.put('/:postId/vote-up', auth, async (req, res) => {
  const user = req.user;
  Post.findById(req.params.postId)
    .then(async post => {
      if (!post) {
        return res.status(400).json({ message: `invalid postId` });
      }

      // let previous = post.upVotes.length;
      let contains = post.upVotes.includes(user._id);

      post.downVotes.pull(user._id);
      post.upVotes = addToSet(post.upVotes, user._id);
      post.voteTotal = post.upVotes.length - post.downVotes.length;

      post.save();

      // let after = post.upVotes.length;

      let postAuthor = await User.findById(post.authorId).exec();
      let assignedUser;
      if (post.complete && post.assignedUser) {
        assignedUser = await User.findById(post.assignedUser).exec();
      }

      if (antiSpam(user, postAuthor)) {
        // console.log(chalk.magenta('save==========='));
        postAuthor.karma = postAuthor.karma + (contains ? (postAuthor.karma > 0 ? -1 : 0) : 1); // subtract 1 if a user who has upvoted, upvotes again (to remove upvote)
        if (assignedUser) {
          // console.log(chalk.green('save assigned==========='));
          assignedUser.karma = assignedUser.karma + (contains ? -2 : 1);
          await assignedUser.save();
        }
        await postAuthor.save();
      }

      sendNotification(postAuthor, req.user, post, 'Upvote');

      return res.status(200).send(post);
    })
    .catch(err => {
      return res.status(401).send({ error: `Error when upvoting: ${err}` });
    });
});

postRouter.put('/:postId/vote-down', auth, async (req, res) => {
  const user = req.user;
  Post.findById(req.params.postId)
    .then(async post => {
      if (!post) {
        return res.status(400).json({ message: `invalid postId` });
      }

      // let previous = post.downVotes.length;

      let contains = post.downVotes.includes(user._id);
      post.upVotes.pull(user._id);
      post.downVotes = addToSet(post.downVotes, user._id);
      post.voteTotal = post.upVotes.length - post.downVotes.length;

      post.save();

      // let after = post.downVotes.length;
      let postAuthor = await User.findById(post.authorId).exec();

      if (antiSpam(user, postAuthor)) {
        postAuthor.karma = postAuthor.karma > 0 ? postAuthor.karma + (contains ? 1 : -1) : 0; // if user is un-down voting, add one to karma, otherwise subtract one
        await postAuthor.save();
      }

      sendNotification(postAuthor, req.user, post, 'Downvote');

      return res.status(200).send(post);
    })
    .catch(err => {
      return res.status(401).send({ error: `Error when downvoting: ${err}` });
    });
});

module.exports = postRouter;
