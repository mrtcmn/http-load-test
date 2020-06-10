const express = require('express');
const port = process.env.PORT || 8001;
const app = express();
const server = require('http').createServer(app);
const bodyParser = require('body-parser');

app.use(bodyParser.json());

app.get('/test', (req, res) => {

  // todo Write to database or processing
  console.log('Get test'); // Data comes from requests body.

  // Content-Type: application/json
  res.send({"dc": "Success", "rc": 100})

});


app.post('/test', (req, res) => {

  // todo Write to database or processing
  console.log('Post test'); // Data comes from requests body.
  console.log(req.body);
  console.log(req.headers);
  // Content-Type: application/json
  res.send({"dc": "Success", "rc": 100})

});

server.listen(port, () => console.log(`Example endpoint running! - ${port}!`));
