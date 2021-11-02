const HttpLoadTest = require('../index');

let httpLoadInstance = new HttpLoadTest({
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

httpLoadInstance.startTest();
