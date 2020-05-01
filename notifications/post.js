const cron = require('node-cron');

const Post = require(__dirname + '/../models/post');
const User = require(__dirname + '/../models/post');

const expiring = () => {
    const todayHour = moment(new Date()).minutes(0).seconds(0)
    const todayNextHour = todayHour.add(1, 'hours')

    const tomorrowHour = todayHour.add(1, 'days')
    const tomorrowNextHour = todayNextHour.add(1, 'days')

    return Post.find(
      {
        completed: false,
        dueDate: {
          $gte: tomorrowHour,
          $ld: tomorrowNextHour,
        }
      }
    ).exec()
}

const notify = (user, post) => {
  console.log(user)
}

cron.schedule('0 * * * *', () => {

  expiring().then(posts => {
    console.log(`${posts.length} posts expiring in 24 hours. Will send emails`);

    posts.forEach(post => {
      const postedUsername = post.username
      const user = User.findOne({ username: postedUsername })
      notify(user, post)
    })
  })
})

export { expiring }
