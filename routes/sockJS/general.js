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
var sessionStore = module.parent.exports.sessionStore;
/*********************************************************************************
Routes
	
/********************************************************************************/
module.exports = {

}
/*********************************************************************************
     End
/********************************************************************************/
