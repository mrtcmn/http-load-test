const express = require('express');
const port = process.env.PORT || 8001;
const app = express();
const server = require('http').createServer(app);


app.get('/test',(req,res)=> {

  // todo Write to database or processing
  console.log('request'); // Data comes from requests body.

  // Content-Type: application/json
  res.send({"dc":"Success","rc":100})

});

server.listen(port, () => console.log(`Example endpoint running! - ${port}!`));
