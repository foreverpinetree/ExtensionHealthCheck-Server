var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
// var ParseServer = require('parse-server').ParseServer;

var index = require('./routes/index');
var users = require('./routes/users');
// var stripe = require('./routes/stripe');
var paddle = require('./routes/paddle');

const ENV = process.env.NODE_ENV
var config = require('./config-dev.json')
if(ENV === 'production'){
  config = require('./config.json')
}
// console.log(config)
// var api = new ParseServer(config);

var app = express();
app.locals.healthMonitor = require('./services/health-monitor').createHealthMonitor();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(require('./routes/robots'));

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.png')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(require('./routes/health')(app.locals.healthMonitor));
app.use('/', index);
// app.use('/users', users);
// app.use('/stripe', stripe);
// app.use('/paddle', paddle);
// app.use('/parse', api);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
