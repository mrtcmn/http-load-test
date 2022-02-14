const HttpLoadTest = require('../index');

let httpLoadInstance = new HttpLoadTest({
  url: 'http://localhost:8001/test',
  method: 'post',
  totalRequest: 100,
  psRequest: 100,
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

httpLoadInstance.onListener.on('finished', (stats) => {
  console.log('Test finished', stats);
});

httpLoadInstance.setDynamicDataFunction(() => ( {
  test: Date.now().toString()
}));

httpLoadInstance.startTest();
