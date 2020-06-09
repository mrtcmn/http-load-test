const axios = require('axios');
const {CONFIG_PARAMS} = require('./constant');
const {_aa} = require('./utlis');

class HttpLoadTest {


  constructor(config) {

    this.TOTAL_REQUEST = 0;
    this.PER_SECOND_REQUEST = 0;
    this.AXIOS_OPTIONS = {
      method: 'get'
    };
    this.stats = {
      passed: 0,
      failed: 0,
      totalRequest: 0
    };

    this.MAIN_JOB = [];

    this.successChecker = undefined;

    this.parseConfig(config);
  }


  prepareAxiosOptions(key, data, axiosKey) {

    let _config = _aa(key, data);

    if (_config) {
      this.AXIOS_OPTIONS = {
        ...this.AXIOS_OPTIONS,
        ...{[axiosKey]: _config}
      }
    } else {
      return false;
    }

  }

  parseConfig(_c) {

    if (!_c && typeof _c !== 'object') {
      throw new Error(`At least one config parameter needs to deploy.`)
    }

    this.TOTAL_REQUEST = _c[CONFIG_PARAMS.TOTAL_REQUEST] || 10;
    this.PER_SECOND_REQUEST = _c[CONFIG_PARAMS.PER_SECOND_REQUEST] || 10;
    this.stats.totalRequest = this.TOTAL_REQUEST;
    // Axios configuration

    _c[CONFIG_PARAMS.URL] ? this.prepareAxiosOptions([CONFIG_PARAMS.URL], _c, 'url') : null;
    _c[CONFIG_PARAMS.METHOD] ? this.prepareAxiosOptions([CONFIG_PARAMS.METHOD], _c, 'method') : null;


    _c[CONFIG_PARAMS.HEADERS] ? this.prepareAxiosOptions([CONFIG_PARAMS.HEADERS], _c, 'headers') : null;
    _c[CONFIG_PARAMS.BODY] ? this.prepareAxiosOptions([CONFIG_PARAMS.BODY], _c, 'body') : null;

    this.successChecker = _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN] ? _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN] : null;


  }


  oneJob(index) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const httpRequestTicket = () => {

          axios(
            this.AXIOS_OPTIONS
          )
            .then(res => {

              if (this.successChecker) {
                const _sc = this.successChecker(res);
                if (_sc) {
                  this.stats.passed++
                }
                this.stats.failed++

              } else {
                this.stats.passed++
              }

              resolve();
              console.log(this.stats);
            })
            .catch(error => {
              this.stats.total++;
              this.stats.failed++;
              resolve();
            })
        };
        httpRequestTicket();
      }, index * (1000 / this.PER_SECOND_REQUEST));
    });
  }


  startTest() {
    this.MAIN_JOB = new Array(this.TOTAL_REQUEST).fill(true).map((i, index) => this.oneJob(index));
  }
}

module.exports = HttpLoadTest;
