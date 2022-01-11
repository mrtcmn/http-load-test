
const axios = require('axios');

const instance = axios.create();

instance.interceptors.request.use((req) => {
  req.startTime = new Date().getTime();
  return req;
});

instance.interceptors.response.use((res) => {

  res.endTime = new Date().getTime();
  return res;
});

module.exports = instance;
