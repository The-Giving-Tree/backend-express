const express = require('express');

const Post = require('../../models/post');
const { postSlackMessage } = require('../../util/postSlackMessage');

const emailFeedback = express.Router();

emailFeedback.get('/:postId/:rating', async (req, res) => {
  const { postId, rating } = req.params;
  const ratingInt = parseInt(rating, 10);

  try {
    const post = await Post.findById(postId).populate('authorId');
    const author = post.authorId;

    if (post && Number.isInteger(ratingInt) && ratingInt > 0 && ratingInt < 6) {
      post.emailFeedbackStars = parseInt(rating, 10);
      await post.save();

      await postSlackMessage(
        '#completed-req-feedback',
        `New feedback from *${author.name}*: ${'⭐️'.repeat(ratingInt)} \n>\n${(process.env
          .NODE_ENV === 'PRODUCTION'
          ? 'https://www.givingtreeproject.org'
          : 'http://localhost:3001') +
          '/post/' +
          post._id}`,
        {
          username: 'GivingTree Bot'
        }
      );
    }
  } catch (e) {}

  res.send(`<html><head><link href="https://fonts.googleapis.com/css2?family=Poppins&display=swap" rel="stylesheet"><style>
  body { font-family: 'Poppins', sans-serif; text-align: center; }
  img { width: 200px; }
  </style></head><body><img src="https://d1ppmvgsdgdlyy.cloudfront.net/email/logo.png" /><p>Thank you for your feedback</p><p style="margin-top: 24px">You will be redirected to <a href="https://www.givingtreeproject.org/home/discover">The Giving Tree</a> homepage shortly.</p><script>setTimeout(() => { 
    window.location.replace('https://www.givingtreeproject.org/home/discover');
  }, 2500);</script></body></html>`);
});

module.exports = emailFeedback;
