# http-load-test (Alpha)

[![npm version](https://badge.fury.io/js/http-load-test.svg)](https://badge.fury.io/js/http-load-test)

Complete endpoint load test.

## Installation

Choose to favorite package manager and install `http-load-test` package.

`npm install http-load-test`

or

`yarn install http-load-test`

## Basic Usage

```javascript
const HttpLoadTest = require('http-load-test');

let job = new HttpLoadTest({
  url: 'http://localhost:8001/test', // Enpoint Url
  totalRequest: 10, // How many request what you want as TOTAL
  psRequest: 1, // How many request you want for PER SECOND
  method: 'post', // Http methods
  data: { // Body
    test: "test2"
  },
  headers: {
    'CustomHeaderKey': 'CustomHeaderValue',
    'content-type': 'application/json', 
  },
  requestConfig: { // All axios request configs can apply here 
    responseType: 'json',
  }
})

job.startTest(); // For starting to http load test.

```

##TODO's

If you want to contribute feel to free for join. Open issue. 

- [x] Support other http methods.
- [x] Body and header append
- [x] Allow to all axios options.
- [ ] Custom success response function
- [ ] Advanced statistics such as http ms, total time etc.
- [ ] Handling all error codes and append total report
