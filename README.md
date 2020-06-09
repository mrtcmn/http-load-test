# http-load-test (Alpha)

Complete endpoint load test.

##Installation

Choose to favorite package manager and install `http-load-test` package.

`npm install http-load-test`

or

`yarn install http-load-test`

##Basic Usage

```javascript
const HttpLoadTest = require('http-load-test');

let job = new HttpLoadTest({
  url: 'http://localhost:8001/test', // Pass setting where you want to request
  totalRequest: 10, // How many request you want
  psRequest: 1 // How many request you want for each second
})

job.startTest(); // Don't forget to fire test

```

##TODO's

If you want to contribute feel to free for join. Open issue. 

- [ ] Support other http methods.
- [ ] Body and header append
- [ ] Allow to all axios options.
- [ ] Custom success response function
- [ ] Advanced statistics such as http ms, total time etc.
- [ ] Handling all error codes and append total report
