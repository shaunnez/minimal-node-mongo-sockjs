/*********************************************************************************
	Dependencies
		- Node Modules and Packages
/********************************************************************************/
var path = require('path')
	, fs = require('fs')
	, os = require('os')
	, cluster = require('cluster')
	, http = require('http')
	, request = require('request')
	, express = require('express')
	, connect = require('connect')
	, sockJS = require('sockjs')
	, mongoClient = require('mongodb').MongoClient
	, mongoServer = require('mongodb').Server
	, mongoStore = require('connect-mongo')(express)
	, cookie = require('cookie')
	, async = require('async')
	, moment = require('moment')
	, failureRate = 0
	, failureTolerance = 50;

/*********************************************************************************
	General Configuration & Exported Variables
		- Export means these variable is accessible by other files
		- E.g. io.sockets.emit can be used anywhere
/********************************************************************************/
var env = process.argv.length > 2 ? process.argv[2].toLowerCase() : 'development'
	, port = process.env.PORT || 8081
	, clientPath = (env == "development") ? path.join(__dirname, '/public') : path.join(__dirname, '/dist' )
	, expressRoutesPath = path.join(__dirname, '/routes/api')
	, sockJSRoutesPath = path.join(__dirname, '/routes/sockJS')

var app = exports.app = express()
	, config = exports.config = require('./config/' + env)
	, methods = exports.methods = require('./methods/methods.js')
	, db = null
	, sessionStore = null
	, httpServer = null
	, io = null
/*********************************************************************************
	Mongo Database
		- connect to the database based on the JSON config file
		- sets up a session store
		- pass a callback so the rest of the "startup" can proceed
/********************************************************************************/
var connectDatabase = function(next) {
	var ms = new mongoServer(config.database.host, config.database.port, { auto_reconnect: true, safe: true });
			mc = new mongoClient(ms);

	// open connection to database
	mc.open(function(err, client) {
		if(err) throw err;

		cluster.on('online', function(worker) {
			console.log('Process forked, worker PID=', worker.process.pid);
		});

		cluster.on('exit', function(worker) {
			if(process.shuttingDown) {
				return;
			}
			if(!process.shuttingDown && !worker.suicide) {
				failureRate++;
			}
			var exitCode = worker.process.exitCode;
			if(failureRate < failureTolerance) {
				console.log('worker ' + worker.process.pid + ' died ('+exitCode+'). restarting...');
				cluster.fork();
			} else if(!process.shuttingDown){
				tearDown('Too many failures');
			}
		})

		if(cluster.isMaster) {
			for(var i = 0, j = os.cpus().length; i < j; i++) {
				cluster.fork();
			}
		} else {
			// setup general database variable for manipulation
			db = client.db(config.database.db);
			exports.db = db;
			// set the database against the methods
			methods.init(db);
			// create session store
			sessionStore = new mongoStore(config.database);
			exports.sessionStore = sessionStore;
			// next method
			next();
		}
	})
}


// multi threading teardown
var tearDown = function(message) {
	var message = message || "None given";
	if(process.isMaster) {
		process.shuttingDown = true;
		console.log('shutting down in 10 seconds, reason: ', message);
	} else {
		console.log('shutting down child process', message);
	}
	process.exit();
}

// multi threading sig int - teardown
process.on('SIGINT', function(a) {
	tearDown("SIGINT");
});
/*********************************************************************************
	Express
		- with sessions, development and production setup
		- uses mongo store for sessions
		- cross domain can be removed, useful if setting up an API address
/********************************************************************************/
// cross domain access
var allowCrossDomain = function (req, res, next) {
	// could set specific url here
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	next();
}

// server configuration
var configureServer = function () {
	// general settings
	app.configure(function () {
		app.set('port', port);
		app.use(express.favicon());
		app.use(express.logger('dev'));
		app.use(express.bodyParser());
		app.use(express.methodOverride());
		app.use(allowCrossDomain);
		app.use(express.cookieParser(config.session.secret));
		app.use(express.session({
			secret : config.session.secret
			, store  : sessionStore
			, cookie : { maxAge: new Date(Date.now() + 864000000) } // one day
		}));
		app.use(app.router);
		app.use(express.static(clientPath));
	});
	// development settings
	app.configure('development', function () {
		app.use(express.errorHandler());
	});
	//production settings
	app.configure('production', function () {
    	app.use(express.logger());
    	app.use(express.errorHandler());
	});
}

/*********************************************************************************
	Express Server End Points
		- sets up the route path end point and the catch all end point
		- loads individual routes from the routes/express folder
/********************************************************************************/
var configureExpressEndPoints = function() {
	app.get("/", function (req, res) {
		req.session.loginDate = new Date().getTime();
		res.sendfile(clientPath + "/index.html");
	});
	// for debugging only
	app.get("/session", function (req, res) {
		res.send(req.session);
	});
	// loads all routes in routes express folder
	fs.readdirSync(expressRoutesPath).forEach(function (file) {
		if (file.substr(file.lastIndexOf('.') + 1) !== 'js')
		    return;
		var name = file.substr(0, file.indexOf('.'));
		require(expressRoutesPath + "/" + name)(app);
	});
	// capture everything else - setup 405 / 500 here
	app.use(function (req, res, next) {
		res.sendfile(clientPath + "/index.html");
	});
}
/*********************************************************************************
	SockJS Configuration
/********************************************************************************/
var configureSockJS = function (httpServer) {
	io = sockJS.createServer();
	io.installHandlers(httpServer, {prefix:'/sock'});
	exports.io = io;
}
/*********************************************************************************
	Socket IO Server End Points
	- sets up initial connection and error sockets
	- loads individual socket routes from the files in the routes/socket folder
	- puts these methods into a json object which are passed to the connecting sockets
/********************************************************************************/
var configureSockJSEndPoints = function() {
	var sockJSMethods = {};
	var sockJSConnections = {}
	// get all the methods and store them into this variable so we can easily assign
	//them to each connecting socket
	fs.readdirSync(sockJSRoutesPath).forEach(function (file) {
		if (file.substr(file.lastIndexOf('.') + 1) !== 'js') {
			return;
		}
		var name = file.substr(0, file.indexOf('.'));
		var methods = require(sockJSRoutesPath + "/" + name);
		for(key in methods){
			sockJSMethods[key] = methods[key]
		}
	});

	// sockJS connection
	io.on('connection', function(conn) {
		console.log("CONNECTION OPEN: " + conn)
		// keep a reference to this connection
		sockJSConnections[conn.id] = conn;
		// on receiving data, broadcast to everyone else
		conn.on("data", function(m) {
			console.log("DATA RECEIVED: " + m);
			for(var id in sockJSConnections) {
				sockJSConnections[id].write(m);
			}
		})
		// on close, delete the connection
		conn.on("close", function(conn) {
			delete broadcast[conn.id];
			console.log("CONNECTION CLOSED: " + conn)
		})

		setInterval(function() {
			for(var id in sockJSConnections) {
				sockJSConnections[id].write("PING");
			}
		}, 1000)
	})
}
/*********************************************************************************
Run Server
/********************************************************************************/
connectDatabase(function() {
	console.log('************* Connected to Mongo Database: ' + config.database.db);
	configureServer();
	console.log("************* Express Server Configured");
	configureExpressEndPoints();
	console.log("************* Express End Points Configured");
	httpServer = http.createServer(app).listen(port);
	console.log("************* Express Server Running on Port: " + port);
	configureSockJS(httpServer);
	console.log("************* SockJS Running");
	configureSockJSEndPoints();
	console.log("************* SockJS End Points Configured");
	console.log("************* Server Ready")
})
/*********************************************************************************
 End
/********************************************************************************/
