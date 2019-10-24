var express = require('express');
var app = express();
var http = require('http').Server(app);

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.use('/ot.js', express.static('ot.js'));
app.use('/libs', express.static('libs'));
app.use('/node_modules', express.static('node_modules'));

http.listen(3000, function(){
  console.log('listening on *:3000');
});
