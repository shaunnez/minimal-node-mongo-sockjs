// require.js configuration
require.config({
  baseUrl: 'js/lib',
  urlArgs: 'bust=1.0.1',
  paths: {
    app:            '../app',
    lib:            '../lib'
  },
  shim: {
    'sockjs': {
        deps: ['jquery'],
        exports: 'sockjs'
    }
  }
});

// initialize require load
require(['jquery', 'sockjs', 'fastclick' ], function ($) {
  FastClick.attach(document.body);

  console.log("CLIENT READY - connecting to SOCKETS")

  window.io = new SockJS('http://localhost:8081/sock');
  io.onopen = function() {
    console.log('SOCKJS - Connected');
  };
  io.onmessage = function(e) {
    console.log('SOCKJS - Message: ', e.data);
  };
  io.onclose = function() {
    console.log('SOCKJS - Closed');
  };
});
