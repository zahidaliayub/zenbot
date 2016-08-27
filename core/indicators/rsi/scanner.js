var n = require('numbro')
  , colors = require('colors')
  , parallel = require('run-parallel')
  , tb = require('timebucket')
  , o = require('object-get')

module.exports = function container (get, set, clear) {
  var get_tick_str = get('utils.get_tick_str')
  var get_timestamp = get('utils.get_timestamp')
  var z = get('utils.zero_fill')
  var start = new Date().getTime()
  return function scanner (g, cb) {
    var c = get('config')
    var options = get('options')
    var tick = g.tick, last_tick = g.last_tick
    if (c.rsi_sizes.indexOf(tick.size) === -1) {
      // only process certain sizes for efficiency
      return cb(null, g)
    }
    //get('logger').info('RSI', get_tick_str(tick.id), 'computing'.grey)
    var d = tick.data.trades || {}
    var bucket = tb(tick.time).resize(tick.size)
    var tasks = []
    var lookback
    // for each exchange
    Object.keys(d).forEach(function (e) {
      // for each pair
      Object.keys(d[e]).forEach(function (pair) {
        // create a task
        tasks.push(function (sub_done) {
          // init rsi key for pair
          var de = d[e][pair]
          de['rsi'] || (de['rsi'] = {})
          var r = de['rsi']
          r.ansi = ''
          var selector = 'data.trades.' + e + '.' + pair
          // prev tick pair data
          var prev_tick = o(last_tick || {}, selector)
          // if the prev tick has rsi calculated, use the prev avg's
          // this is what causes smoothing in the algorithm.
          if (prev_tick && prev_tick.rsi) {
            with_last_avg(prev_tick.close, prev_tick.rsi.avg_gain, prev_tick.rsi.avg_loss)
          }
          // else we need to average the last 14 ticks
          else {
            // do we have lookback cached?
            if (!lookback) {
              // not cached, fetch last 14 periods
              var params = {
                query: {
                  app: get('app_name'),
                  size: tick.size,
                  time: {
                    $lt: bucket.toMilliseconds()
                  }
                },
                limit: c.rsi_periods,
                sort: {
                  time: -1
                }
              }
              get('ticks').select(params, function (err, result) {
                //console.error('lookback', params, result)
                if (err) return sub_done(err)
                lookback = result.reverse()
                with_lookback()
              })
            }
            else {
              with_lookback()
            }
          }
          function with_lookback () {
            // calculate 14-period average gains and losses
            var close_lookback = lookback.filter(function (tick) {
              return !!o(tick, selector)
            }).map(function (tick) {
              return o(tick, selector + '.close')
            })
            r.close_lookback = close_lookback
            if (close_lookback.length < c.rsi_periods) {
              // not enough lookback to start first tick.
              //get('logger').info('RSI', get_tick_str(tick.id), ('not enough lookback: ' + close_lookback.length).grey)
              return sub_done()
            }
            last_close = 0
            var gain_sum = close_lookback.reduce(function (prev, curr) {
              if (!last_close) {
                last_close = curr
                return 0
              }
              var gain = curr > last_close ? curr - last_close : 0
              last_close = curr
              return prev + gain
            }, 0)
            var avg_gain = r.samples ? n(gain_sum).divide(r.samples).value() : 0
            last_close = 0
            var loss_sum = close_lookback.reduce(function (prev, curr) {
              if (!last_close) {
                last_close = curr
                return 0
              }
              var loss = curr < last_close ? last_close - curr : 0
              last_close = curr
              return prev + loss
            }, 0)
            var avg_loss = r.samples ? n(loss_sum).divide(r.samples).value() : 0
            // now we have a prev value to work with
            with_last_avg(last_close, avg_gain, avg_loss)
          }
          function with_last_avg (last_close, last_avg_gain, last_avg_loss) {
            r.last_close = last_close
            // calculate current gains and losses
            var current_gain, current_loss
            if (!last_close) {
              current_gain = current_loss = 0
            }
            else {
              current_gain = de.close > last_close ? n(de.close).subtract(last_close).value() : 0
              current_loss = de.close < last_close ? n(last_close).subtract(de.close).value() : 0
            }
            // average the last avgs with current (smoothing)
            r.avg_gain = n(last_avg_gain).multiply(c.rsi_periods - 1).add(current_gain).divide(c.rsi_periods).value()
            r.avg_loss = n(last_avg_loss).multiply(c.rsi_periods - 1).add(current_loss).divide(c.rsi_periods).value()
            // prevent divide by zero
            if (r.avg_loss === 0) {
              r.value = r.avg_gain ? 100 : 50
            }
            else {
              // avg gains / avg losses
              r.relative_strength = n(r.avg_gain).divide(r.avg_loss).value()
              // normalized to 0 - 100 scale
              r.value = n(100).subtract(n(100).divide(n(1).add(r.relative_strength))).value()
            }
            //console.error(gain_sum, avg_gain, loss_sum, avg_loss, avg_gain_2, avg_loss_2, relative_strength)
            r.ansi = n(r.value).format('0')[r.value > 70 ? 'green' : r.value < 30 ? 'red' : 'white']
            // calc finshed.
            get('logger').info('RSI', get_tick_str(tick.id), 'computed'.grey, r.ansi)
            sub_done()
          }
        })
      })
    })
    parallel(tasks, function (err) {
      if (err) return cb(err)
      cb(null, g)
    })
  }
}
