const httpHelper = require('./utils/httpHelper');
const {CONFIG_PARAMS} = require('./constant');
const {_aa} = require('./utlis');
const _ = require("lodash");

class HttpLoadTest {

  constructor(config) {

    this.TOTAL_REQUEST = 0;
    this.PER_SECOND_REQUEST = 0;
    this.AXIOS_REQUEST_CONFIG = {
      method: 'get'
    };
    this.stats = {
      passed: 0,
      failed: 0,
      totalRequest: 0
    };

    this.dynamicDataFunction = undefined;

    this.MAIN_JOB = [];
    this.successChecker = undefined;
    this.parseConfig(config);
  }


  prepareAxiosOptions(axiosRequestKey, value) {

    if (axiosRequestKey) {
      this.AXIOS_REQUEST_CONFIG = {
        ...this.AXIOS_REQUEST_CONFIG,
        ...{[axiosRequestKey]: value}
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
    _c[CONFIG_PARAMS.URL] ? this.prepareAxiosOptions('url', _c[CONFIG_PARAMS.URL]) : null;
    _c[CONFIG_PARAMS.METHOD] ? this.prepareAxiosOptions('method', _c[CONFIG_PARAMS.METHOD]) : null;
    _c[CONFIG_PARAMS.HEADERS] ? this.prepareAxiosOptions('headers', _c[CONFIG_PARAMS.HEADERS]) : null;
    _c[CONFIG_PARAMS.DATA] ? this.prepareAxiosOptions('data', _c[CONFIG_PARAMS.DATA]) : null;


    if (_c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS] && _.isPlainObject(_c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS])) {
      Object.keys(_c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS]).forEach((configKey) => {
        this.prepareAxiosOptions(configKey, _c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS][configKey]);
      });
    } else {
      throw new Error("responseConfig is not valid object.")
    }


    this.successChecker = _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN] ? _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN] : null;


  }


  setRequestSuccessChecker(checkerHandler) {
    this.successChecker = checkerHandler;
  }

  setDynamicDataFunction(dynamicDataFunction) {
    this.dynamicDataFunction = dynamicDataFunction;
  }


  oneJob(index) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const httpRequest = () => {
          httpHelper(
            {
              ...this.AXIOS_REQUEST_CONFIG,
              ...{
                data: (this.dynamicDataFunction ? this.dynamicDataFunction() : null)
              }
            }
          )
            .then(res => {

              if (this.successChecker) {
                const _sc = this.successChecker(res);
                if (_sc) {
                  this.stats.passed++;
                } else {
                  this.stats.failed++;

                }

              } else {
                this.stats.passed++;
              }

              resolve();
              console.log(this.stats);
            })
            .catch(error => {


              if (this.successChecker) {
                const _sc = this.successChecker(error);
                if (_sc) {
                  this.stats.passed++;
                } else {
                  this.stats.failed++;
                }

              } else {
                this.stats.passed++;
              }

              this.stats.total++;
              resolve();
            })
        };
        httpRequest();
      }, index * (1000 / this.PER_SECOND_REQUEST));
    });
  }


  startTest() {
    this.MAIN_JOB = new Array(this.TOTAL_REQUEST).fill(true).map((i, index) => this.oneJob(index));
    Promise.all(this.MAIN_JOB).then((allRes) => {
      console.log('__________________________________________');
      console.log('               TEST COMPLETE              ');
      console.log(this.stats);

      // console.log(allRes);
    }).catch((e) => {

    })
  }
}

module.exports = HttpLoadTest;
