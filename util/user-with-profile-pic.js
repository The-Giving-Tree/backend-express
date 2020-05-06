const crypto = require('crypto');

module.exports = {
  userWithProfilePic: (user) => {
    const authorWithProfilePic = user.toObject();
    if (!authorWithProfilePic.profilePictureUrl ||
      authorWithProfilePic.profilePictureUrl.match(/\.svg$/i)) {
      const emailHash = crypto
        .createHash('md5')
        .update(authorWithProfilePic.email)
        .digest('hex');
      authorWithProfilePic.profilePictureUrl = `https://www.gravatar.com/avatar/${emailHash}?d=mp`;
    }
    return authorWithProfilePic;
  }
}