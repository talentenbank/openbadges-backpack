var url = require('url')
  , crypto = require('crypto')
  , logger = require('../lib/logging').logger
  , configuration = require('../lib/configuration')
  , baker = require('../baker')
  , remote = require('../remote')
  , model = require('../model')

var _award = function(assertion, url) {
  var badge = model.UserBadge(assertion, {pingback: url});
  badge.save(function(err, badge){
    if (err) logger.warn('error saving badge'), console.dir(err);
    logger.info('saved new badge'), console.dir(badge);
  })
}

exports.baker = function(req, res) {
  var query = req.query || {}
    , issuer  , image  , imageURL
    , badge   , md5sum , filename
    , accepts , award

  if (!query.assertion) {
    return res.render('baker', {
      title: 'Creator',
      login: false
    });
  }
  
  accepts = req.headers['accept'] || '';
  award = req.query.award === 'true';
  remote.assertion(query.assertion, function(err, data) {
    if (err.status !== 'success') {
      logger.warn('failed grabbing assertion for URL '+ query.assertion);
      logger.warn('reason: '+ JSON.stringify(err));
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify(err), 400)
    }
    issuer = url.parse(query.assertion);
    image = url.parse(data.badge.image);
    if (!image.hostname) {
      image.host = issuer.host;
      image.port = issuer.port;
      image.slashes = issuer.slashes;
      image.protocol = issuer.protocol;
      image.hostname = issuer.hostname;
    }
    imageURL = url.format(image);
    remote.badgeImage(imageURL, function(err, imagedata) {
      if (err) {
        logger.warn('failed grabbing badge image '+ imageURL);
        logger.warn('reason: '+ JSON.stringify(err));
        res.setHeader('Content-Type', 'application/json');
        return res.send(JSON.stringify(err), 400)
      }
      try {
        badge = baker.prepare(imagedata, query.assertion);
      } catch (e) {
        logger.error('failed writing data to badge image: '+ e);
        res.setHeader('Content-Type', 'application/json');
        return res.send(JSON.stringify({
          status: 'failure',
          error: 'processing',
          reason: 'could not write data to PNG: ' + e
        }), 400);
      }
      
      if (accepts.match('application/json')) {
        res.setHeader('Content-Type', 'application/json');
        return res.send(JSON.stringify({'status':'success', 'assertion': JSON.stringify(data) }));
      }
      
      md5sum = crypto.createHash('md5');
      filename = md5sum.update(badge).digest('hex');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'attachment; filename="'+filename+'.png"');
      if (award) _award(data, query.assertion);
      return res.send(badge);
    });
  });
}

