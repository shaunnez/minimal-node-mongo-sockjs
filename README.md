minimal-node-mongo-sockjs
=========================

Minimal Node Mongo SockJS Boilerplate
	The node server has everything setup so all thats needed to be done is a npm install, adjust the config/development.json file, and run node server.js

Server Side (folders include config, methods, routes, and server.js)

	1) Connection to the database specified in the config file
	2) Setting up an express server and seperating development and production settings up
	3) Seperation of express end points into a clean folder / file structure
		3a) Adding a new routes to the routes/api/api.js file
		3b) Add a new JS file to this folder with a similar structure, automatically added to the available end points
	4) Setup sockjs and seperation of sock.js listeners into a folder structure as above (3) - routes/sockjs

Client Side (everything in the public folder)

	1) Require.js is used for logical loading of javascript files. (app.js)
	2) Libraries I generally recommend include fastclick, jquery, require, sockjs
	3) Some nice fonts, and using font-awesome for icons


Motivation

	 Anice starting server and client side starting point for future projects

Installation

	Install node and mongodb, run npm-install in the project directory, run node server.js. Changing the development.json file may be needed

API Reference

	The routes/api/api.js file is an external api, once authenticated users should be able to hit these urls to get / update data as needed.

Contributors 

	Shaun Nesbitt <uksn@me.com>

License

	Open Source - do with it as you will, feedback is always appreciated.