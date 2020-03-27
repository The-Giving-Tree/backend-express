const express = require('express');
const postRouter = express.Router();
const auth = require(__dirname + '/../../middlewares/auth');
const postController = require(__dirname + '/../../controllers/post');
const Post = require(__dirname + '/../../models/post');
const User = require(__dirname + '/../../models/user');
const NewsFeed = require(__dirname + '/../../models/newsfeed');
const Notification = require(__dirname + '/../../models/notification');
var io = require(__dirname + '/../../mysockets');
const sendNotification = require(__dirname + '/../../util/notification');

const getPosts = () => {
  return Post.find().populate('authorId');
};

const getPost = id => {
  return Post.findOne({ _id: id }).populate('authorId');
};

const getDraft = (id, user) => {
  return Post.findOne({ _id: id, authorId: user._id }).populate('authorId');
};

const removePost = (_id, user) => {
  return Post.remove({ _id, author: user });
};

postRouter.get('/:id', (req, res) => {
  const id = req.params.id;

  getPost(id)
    .then(post => {
      if (!post) {
        return res.status(401).send({ message: `Post doesn't exist anymore` });
      }

      return res.json(post);
    })
    .catch(err => {
      res.status(401).send({ message: `Error finding post: ${err}` });
    });
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

postRouter.delete('/:postId', postController.validate('deletePost'), postController.deletePost);

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
      .populate('assignedUser', 'name ussername email karma createdAt profilePictureUrl')
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

      if (post.assignedUser.toString() !== user._id.toString()) {
        return res.status(400).json({ message: `you cannot unclaim a different user's task` });
      } else {
        // only if assigned user === the user
        post.assignedUser = undefined;

        post.save();

        let postAuthor = await User.findById(post.authorId).exec();

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

      let previous = post.downVotes.length;

      post.downVotes.pull(user._id);
      post.upVotes = addToSet(post.upVotes, user._id);
      post.voteTotal = post.upVotes.length - post.downVotes.length;

      post.save();

      let after = post.downVotes.length;
      let postAuthor = await User.findById(post.authorId).exec();

      if (after > previous && antiSpam(user, postAuthor)) {
        postAuthor.karma = postAuthor.karma + 1;
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

      let previous = post.downVotes.length;

      post.upVotes.pull(user._id);
      post.downVotes = addToSet(post.downVotes, user._id);
      post.voteTotal = post.upVotes.length - post.downVotes.length;

      post.save();

      let after = post.downVotes.length;
      let postAuthor = await User.findById(post.authorId).exec();

      if (after > previous && antiSpam(user, postAuthor)) {
        postAuthor.karma = postAuthor.karma > 1 ? postAuthor.karma - 1 : 0;
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
