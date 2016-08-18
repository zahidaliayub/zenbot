module.exports = function container (get, set) {
  var c = get('zenbrain:config')
  return get('controller')()
    .add(function (req, res, next) {
      if (req.query.secret && req.query.secret === get('zenbrain:secret')) {
        req.session.secret = req.query.secret
      }
      next()
    })
    .get('/', function (req, res, next) {
      res.render('home')
    })
    .add('/logs', '/logs/data', function (req, res, next) {
      if (!req.session.secret) {
        return next(new Error('access denied to ' + req.method + ' ' + req.url))
      }
      next()
    })
    .get('/logs', function (req, res, next) {
      res.render('logs')
    })
}