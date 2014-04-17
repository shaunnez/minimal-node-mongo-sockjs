/*********************************************************************************
	Dependencies
/********************************************************************************/
var BSON = require('mongodb').BSONPure  // for mongo ids
, crypto = require('crypto')        		// encrypt and decrypt password

// config file from parent, could just require it with relative pathing
var config = module.parent.exports.config;
/*********************************************************************************
Methods
	- exported so available from anywhere
	- requires init to set the database to be used by the methods
	- essentially handles database operations
	- can be called from express endpoints or socket io
/********************************************************************************/
module.exports = {
	// internal reference to the database
	db: null,

	// used to parse the initialized database to this file
	init: function(db) {
		this.db = db;
	},

	// log a request - tracking user activites
	logRequest: function (username, eventName, methodName, params, result) {
		var dbData = {
			username: username,
			timestamp: new Date().getTime(),
			method: methodName,
			event: eventName,
			params: params,
			result: result
		}
		this.addCollectionItem('ActivityLog', dbData, function (result) {
			console.log("New Activity", dbData);
		});
	},

	// login via email and password
	// on registration the email is trimmed into a username, use that here for usability
	login : function (data, callback) {
		// output to be returned
		var output = { success: false, message: "", data: {} };
		var username = data.email.indexOf("@") > -1 ? data.email.substring(0, data.email.indexOf('@')) : data.email;
		var encryptedPassword = crypto.createHash('md5').update(data.password).digest("hex")
		var me = this;
		this.getCollectionItemByParams('User', { username: username, password: encryptedPassword }, function (result) {
			if (result.success == true) {
				delete result.data.password;
				callback(result);
			} else {
				output.message = "The username or password is incorrect";
				callback(output);
			}
		})
	},


	// register a user, encrypt password.
	register: function (data, callback) {
		var encryptedPassword = crypto.createHash('md5').update(data.password).digest("hex")
		// add these variables to the data object
		var me = this;
		// query - either twitter or email login
		var query = { email: data.email };
		// check to see if its in use
		this.getCollectionItemByParams('User', query, function (result) {
			// new user, add them
			if (result.success == false) {
				data.username = data.email.substring(0, data.email.indexOf('@'));
				data.password = encryptedPassword;
				data.dateCreated = new Date().getTime();
				data.dateModified = new Date().getTime();
				data.authenticated = true;
				me.addCollectionItem('User', data, function (result) {
					delete result.data.password;
					callback(result);
				});
			} else {
				var output = { success: false, message: "", data: {} };
				output.message = "Email address is already in use.";
				callback(output);
			}
		});
	},

	// get an entire collection by its name and return it in an array
	getCollectionList : function (collectionName, callback) {
		var cursorCount = 0;
		var items = [];
		this.db.collection(collectionName, function (err, collection) {
			var cursor = collection.find();
			cursor.count(function (err, count) {
				if (count > 0) {
					cursor.each(function (err, doc) {
						if (!err) {
							if (doc != null) {
								items.push(doc);
							}
							cursorCount++;
							if (cursorCount == count) {
								callback(items);
							}
						}
					});
				} else {
					callback(items);
				}
			})
		});
	},

	// as per above method but with pagination, and sorting, TODO: querying
	getCollectionListAdvanced : function (collectionName, options, callback) {
		var cursorCount = 0;
		var items = [];
		//var query = options.query ? options.query : {};           // { 'name' : 'shaun', 'details.age' : { $gte : 25 } }
		var limit = options.limit ? Number(options.limit) : 0;      // pagination : limit 10
		var skip = options.skip ? Number(options.skip) : 0;         //            : skip 10
		var sorter = { };
		var sort = options.sort ? options.sort : '_id';
		var dir = options.dir ? Number(options.dir) : 1;
		sorter[sort] = dir;
		// open the collection
		this.db.collection(collectionName, function (err, collection) {
			// build the cursor based on the params
			var cursor = collection.find();
			// limit the amount of items to be returned
			if(limit > 0)
				cursor.limit(limit);
			// skip a certain amount of items
			if(skip > 0)
				cursor.skip(skip);
			// sort by column asc or desc
			cursor.sort(sorter);
			// get the count
			cursor.count(function (err, count) {
				var max = count > limit && limit != 0 ? limit : count;
				// loop through items and send to the callback method
				if (count > 0) {
					cursor.each(function (err, doc) {
						if (!err) {
							if (doc != null) {
								items.push(doc);
							}
							if (cursorCount == max) {
								callback(items);
							}
							cursorCount++;
						}
					});
				} else {
					// callback if coun is zero
					callback(items);
				}
			})
		});
	},

	// get a single collection item by it's _id, toString to ObjectId so either can be sent in
	getCollectionItemById : function (collectionName, id, callback) {
		var output = { success: false, message: "", data: {} };
		// session doesnt store _id in BSON format
		var id = id.toString();
		if (collectionName !== config.database.collection) {
			id = new BSON.ObjectID(id);
		}
		this.db.collection(collectionName, function (err, collection) {
				var query = { "_id": id };
				collection.findOne(query, function (err, item) {
					if (!err && item) {
						output.success = true;
						output.data = item;
					} else {
						output.message = "Failed to retrieve item from DB";
					}
					callback(output);
			});
		});
	},

	// get a single collection item by the params passed in
	getCollectionItemByParams: function (collectionName, query, callback) {
		var output = { success: false, message: "", data: {} };
		this.db.collection(collectionName, function (err, collection) {
			collection.findOne(query, function (err, item) {
				if (!err && item) {
					output.success = true;
					output.data = item;
				} else {
					output.message = "Failed to retrieve item from DB";
				}
				callback(output);
			});
		});
	},

	// add a new item to a collection
	addCollectionItem : function (collectionName, options, callback) {
		var output = { success: false, message: "", data: {} };
		// do some validation here
		this.db.collection(collectionName, function (err, collection) {
			collection.save(options, function (err, item) {
				if (!err && item) {
					output.success = true;
					output.data = item;
				} else {
					output.message = "Failed to save item into DB";
				}
				callback(output);
			});
		});
	},

	// edit a single item in a collection
	editCollectionItem : function (collectionName, id, options, callback) {
		var output = { success: false, message: "", data: {} };

		this.db.collection(collectionName, function (err, collection) {
			var query = { "_id": new BSON.ObjectID(id.toString()) };
			var set = { "$set": options };
			collection.update(query, set, function (err, item) {
				if (!err && item) {
					output.success = true;
					output.data = item;
				} else {
					output.message = "Failed to update item in DB";
				}
				callback(output);
			});
		});
	},

	// delete a item from a collection
	deleteCollectionItem : function (collectionName, id, callback) {
		var output = { success: false, message: "", data: {} };
		// session doesnt store _id in BSON format
		var id = id.toString();
		if (collectionName !== config.database.collection) {
			id = new BSON.ObjectID(id);
		}
		this.db.collection(collectionName, function (err, collection) {
			var query = { "_id": id };
			collection.remove(query, function (err, item) {
				if (!err && item) {
					output.success = true;
					output.data = item;
				} else {
					output.message = "Failed to delete item in DB";
				}
				callback(output);
			});
		});
	}
}
/*********************************************************************************
	End
/********************************************************************************/
