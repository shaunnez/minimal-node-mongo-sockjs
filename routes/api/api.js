/*********************************************************************************
	Dependencies
/********************************************************************************/
var request = require('request')
// parent config, could use relative path require here
var config = module.parent.exports.config;
// load the methods from the parent file
var methods = module.parent.exports.methods;
// reference io from parent so we can broadcast
var io = module.parent.exports.io;
/*********************************************************************************
                                ROUTES
/********************************************************************************/
module.exports = function (app) {

  // A method which acts as a form of security express (look at delete method below)
  // Make sure the user session is valid, if so, run the callback or send 200.
  // otherwise send 401 status code and let app deal with it
  var authenticateRequest = function (req, res, next) {
    if (req.session) {
      var date = new Date(req.session.cookie.expires);
      // if its still valid, go to the next method
      if (date.getTime() > new Date().getTime()) {
        next();
      } else {
        // remove this session
        methods.deleteCollectionItem(config.database.collection, sessionId, function (result) {
          res.send(401);
        })
      }
    } else {
      res.send(401);
    }
  }

  // delete existing item
  app.delete("/api/:collectionName/:id", authenticateRequest, function (req, res) {
    var collectionName = req.params.collectionName;
    var id = req.params.id;
    methods.deleteCollectionItem(collectionName, id, function (result) {
      res.send(result);
    });
  })

  // login username and password
  app.post("/api/login", authenticateRequest, function (req, res) {
    var email = req.body.email || req.body.username;
    var password = req.body.password;
    // authenticate user
    methods.authenticateUser(email, password, function (result) {
      req.session.user = result.data;
      // send result
      res.send(result);
    });
  });

  // register username and password
  app.post("/api/register", authenticateRequest, function (req, res) {
    var email = req.body.email;
    methods.registerUser(email, function (result) {
      req.session.user = result.data;
      res.send(result);
    });
  });


  // demo remote query using request
  app.post("/api/remoteJSONQuery", authenticateRequest, function (req, res) {
    // url https://api.twitter.com/1.1/users/search.json?q=Twitter%20API&page=1&per_page=5
    // method = "GET"
    var options = { url: req.body.url, method: req.body.method }
    if (req.body.json) {
      options.json = req.body.json;
    }
    request(options, function (error, response, body) {
      var output = { result: false, data: null };
      // body is the returned object from the app
      if (!error && response.statusCode == 200) {
        output.result = true;
        output.data = response.body;
      }
      res.send(output);
    })
  })

  // list of collection, if query string do advanced pagination
  app.get("/api/:collectionName", authenticateRequest, function (req, res) {
    var collectionName = req.params.collectionName;
    var options = req.query;
    if (options.query || options.limit || options.skip || options.sort) {
      methods.getCollectionListAdvanced(collectionName, options, function (result) {
        res.send(result);
      });
    } else {
      methods.getCollectionList(collectionName, function (result) {
        res.send(result);
      });
    }
  });

  // single item from collection
  app.get("/api/:collectionName/:id", authenticateRequest, function (req, res) {
    var collectionName = req.params.collectionName;
    var id = req.params.id;
    methods.getCollectionItemById(collectionName, id, function (result) {
      res.send(result.data);
    });
  });

  // create new item
  app.post("/api/:collectionName", authenticateRequest, function (req, res) {
    var collectionName = req.params.collectionName;
    var options = req.body;
    methods.addCollectionItem(collectionName, options, function (result) {
      if (collectionName == "User") {
        req.session.user = result.data;
      }
      res.send(result.data);
    });
  });

  // edit existing item
  app.put("/api/:collectionName/:id", authenticateRequest, function (req, res) {
    var collectionName = req.params.collectionName;
    var id = req.params.id;
    var options = req.body;
    methods.editCollectionItem(collectionName, id, options, function (result) {
      res.send(result.data);
    });
  })
}
/*********************************************************************************
     End
/********************************************************************************/
