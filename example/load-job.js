const HttpLoadTest = require('../index');

let job = new HttpLoadTest({
  url: 'http://localhost:8001/test',
  method: 'post',
  totalRequest: 10,
  psRequest: 1,
  data: {
    test: "test2"
  },
  headers: {
    'CustomHeaderKey': 'CustomHeaderValue',
    'content-type': 'application/json',
  },
  requestConfig: {
    responseType: 'json',
  }
})

job.startTest();
