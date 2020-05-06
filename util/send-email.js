const fs = require('fs').promises;
const path = require('path');
const sgMail = require('@sendgrid/mail');
const mjml2html = require('mjml');
const Mustache = require('mustache');
const _ = require('lodash');

sgMail.setApiKey(process.env.SG_API_KEY);

const mjmlOptions = {};

const sendEmail = async (templateName, options) => {
  const mjmlTemplateFile = await fs.readFile(path.join(__dirname, `../templates/${templateName}/content.hjs`), 'utf-8');
  const subjectTemplateFile = await fs.readFile(path.join(__dirname, `../templates/${templateName}/subject.hjs`), 'utf-8');

  const partialComponentList = await fs.readdir(path.join(__dirname, `../templates/components`));
  const partials = _.fromPairs(await Promise.all(partialComponentList.map(async (filename) => {
    return [filename.replace('.hjs', ''), await fs.readFile(path.join(__dirname, `../templates/components/${filename}`), 'utf-8')];
  })));

  if (!options || !options.recipient || !options.data) {
    throw new Error('recipient and data required');
  }
  
  const mjmlContent = Mustache.render(mjmlTemplateFile, {
    ...(Object.assign({ recipient: options.recipient }, options.data))
  }, partials);

  const subject = Mustache.render(subjectTemplateFile, {
    ...(Object.assign({ recipient: options.recipient }, options.data))
  });

  const mjmlParseResults = mjml2html(mjmlContent, mjmlOptions);

  const msg = {
    to: options.recipient.email,
    from: 'The Giving Tree <noreply@givingtreeproject.org>',
    subject,
    html: mjmlParseResults.html,
  };

  if (process.env.DEBUG_EMAIL) {
    // Allows us to easily dev/view email HTML
    await fs.writeFile(path.join(__dirname, '..', 'email.html'), msg.html);
    return;
  } else {
    const sgResult = await sgMail.send(msg);

    return {
      msg,
      sgResult,
    };
  }
};

module.exports = {
  sendEmail,
  mjmlOptions,
};
