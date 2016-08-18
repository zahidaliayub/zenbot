var z = require('zero-fill')
  , socketio = require('socket.io')

module.exports = function container (get, set, clear) {
  var c = get('config')
  var get_id = get('utils.get_id')
  return function action () {
    var app = get('app')
    var secret = get_id()
    set('@secret', secret)
    app.listen(function (err) {
      if (err) throw err
      var io = socketio(get('motley:site.server'))
      var max_time
      function poll () {
        var params = {
          query: {
            app: get('app_name')
          },
          sort: {
            time: -1
          },
          limit: c.log_query_limit
        }
        if (max_time) {
          params.query.time = {
            $gte: max_time
          }
        }
        get('logs').select(params, function (err, logs) {
          io.to('logs').emit(
        })
      }
      poll()
      io.on('connection', function (socket) {
        
      })
      var port = get('motley:site.server').address().port
      get('logger').info('server', 'open'.grey, ('http://localhost:' + port + '/?secret=' + secret).yellow, 'to see a live graph.'.grey)
    })
  }
}