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

## Methods

`setRequestSuccessChecker`

If result success related response's body, or status code, setRequestSuccessChecker method can be used for purpose.

Example:
```javascript
httpLoadInstance.setRequestSuccessChecker((response) => {
  try {
    if (response.data.dc === 'Success') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
});
```

`setDynamicDataFunction`

With this method, different data can be generated for each request.

```javascript
httpLoadInstance.setDynamicDataFunction(() => ( {
  test: Date.now().toString()
}));
```


##TODO's

If you want to contribute feel to free for join. Open issue. 

- [x] Support other http methods.
- [x] Body and header append
- [x] Allow to all axios options.
- [ ] Custom success response function
- [ ] Advanced statistics such as http ms, total time etc.
- [ ] Handling all error codes and append total report
