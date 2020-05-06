const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(chaiAsPromised);
chai.use(sinonChai);

const { expect } = chai;

const setApiKeyStub = sinon.stub();
const sendStub = sinon.stub();

const { sendEmail } = proxyquire('../../util/send-email', {
  '@sendgrid/mail': {
    setApiKey: setApiKeyStub,
    send: sendStub
  }
});

describe('Send Email Util', function() {
  beforeEach(function() {
    sendStub.reset();
  });

  it('should throw if no valid recipient', async function() {
    await expect(sendEmail('base-email')).to.eventually.be.rejectedWith(Error);
  });

  it('should throw if no data', async function() {
    await expect(
      sendEmail('base-email', {
        recipient: {
          email: 'test@givingtreeproject.org'
        }
      })
    ).to.eventually.be.rejectedWith(Error);
  });

  it('should not throw if data and recipient', async function() {
    await expect(
      sendEmail('base-email', {
        recipient: {
          email: 'test@givingtreeproject.org'
        },
        data: {}
      })
    ).to.eventually.be.an('object');
  });

  it('should send mail with required properties', async function() {
    await sendEmail('base-email', {
      recipient: {
        email: 'test@givingtreeproject.org'
      },
      data: {}
    });

    expect(sendStub).to.have.been.calledOnce;

    const msg = sendStub.args[0][0];
    expect(msg).to.have.property('to');
    expect(msg).to.have.property('from');
    expect(msg).to.have.property('subject');
    expect(msg).to.have.property('html');
  });

  it('should not send email if DEBUG_EMAIL env var', async function() {
    process.env.DEBUG_EMAIL = true;

    await sendEmail('base-email', {
      recipient: {
        email: 'test@givingtreeproject.org'
      },
      data: {}
    });

    expect(sendStub).not.to.have.been.called;

    delete process.env.DEBUG_EMAIL;
  });
});
