const HttpLoadTest = require('../index');

let job = new HttpLoadTest({
  url: 'http://localhost:8001/test',
  totalRequest: 10,
  psRequest: 1
})

job.startTest();
