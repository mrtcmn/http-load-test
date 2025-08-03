const EventEmitter = require('events');
const BinaryManager = require('../scripts/install-binary');
const ProcessCoordinator = require('./ProcessCoordinator');
const { CONFIG_PARAMS } = require('../constant');

class HttpLoadTest extends EventEmitter {
  constructor(config) {
    super();
    
    // Initialize properties to match original API
    this.TOTAL_REQUEST = 0;
    this.PER_SECOND_REQUEST = 0;
    this.CONCURRENT_REQUEST = 1;
    this.AXIOS_REQUEST_CONFIG = {
      method: 'get'
    };
    this.stats = {
      passed: 0,
      failed: 0,
      totalRequest: 0
    };
    
    this.dynamicDataFunction = undefined;
    this.successChecker = undefined;
    this.binaryManager = new BinaryManager();
    this.coordinator = new ProcessCoordinator(this.binaryManager);
    
    // Parse configuration
    this.parseConfig(config);
  }

  prepareAxiosOptions(axiosRequestKey, value) {
    if (axiosRequestKey) {
      this.AXIOS_REQUEST_CONFIG = {
        ...this.AXIOS_REQUEST_CONFIG,
        ...{[axiosRequestKey]: value}
      };
      return true;
    }
    return false;
  }

  parseConfig(_c) {
    if (!_c || typeof _c !== 'object') {
      throw new Error('At least one config parameter needs to be provided.');
    }

    // Parse configuration parameters
    this.TOTAL_REQUEST = _c[CONFIG_PARAMS.TOTAL_REQUEST] || 10;
    this.PER_SECOND_REQUEST = _c[CONFIG_PARAMS.PER_SECOND_REQUEST] || 10;
    this.CONCURRENT_REQUEST = _c[CONFIG_PARAMS.CONCURRENT_REQUEST] || 1;
    this.stats.totalRequest = this.TOTAL_REQUEST;

    // Axios configuration mapping
    _c[CONFIG_PARAMS.URL] ? this.prepareAxiosOptions('url', _c[CONFIG_PARAMS.URL]) : null;
    _c[CONFIG_PARAMS.METHOD] ? this.prepareAxiosOptions('method', _c[CONFIG_PARAMS.METHOD]) : null;
    _c[CONFIG_PARAMS.HEADERS] ? this.prepareAxiosOptions('headers', _c[CONFIG_PARAMS.HEADERS]) : null;
    _c[CONFIG_PARAMS.DATA] ? this.prepareAxiosOptions('data', _c[CONFIG_PARAMS.DATA]) : null;

    // Handle additional axios configurations
    if (_c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS]) {
      if (typeof _c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS] === 'object') {
        Object.keys(_c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS]).forEach((configKey) => {
          this.prepareAxiosOptions(configKey, _c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS][configKey]);
        });
      } else {
        throw new Error('requestConfig is not a valid object.');
      }
    }

    // Success checker function
    this.successChecker = _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN] || null;
  }

  setRequestSuccessChecker(checkerHandler) {
    this.successChecker = checkerHandler;
  }

  setDynamicDataFunction(dynamicDataFunction) {
    this.dynamicDataFunction = dynamicDataFunction;
  }

  createTestConfig() {
    return {
      url: this.AXIOS_REQUEST_CONFIG.url,
      method: this.AXIOS_REQUEST_CONFIG.method || 'GET',
      headers: this.AXIOS_REQUEST_CONFIG.headers || {},
      data: this.AXIOS_REQUEST_CONFIG.data,
      totalRequests: this.TOTAL_REQUEST,
      requestsPerSecond: this.PER_SECOND_REQUEST,
      concurrentRequests: this.CONCURRENT_REQUEST,
      timeout: this.AXIOS_REQUEST_CONFIG.timeout || 30000,
      successChecker: this.successChecker,
      dynamicDataFunc: this.dynamicDataFunction
    };
  }

  setupCoordinatorHandlers() {
    this.coordinator.on('test_progress', (data) => {
      this.updateStats(data);
      this.emit('progress', data);
    });

    this.coordinator.on('test_complete', (data) => {
      this.emit('test_complete', data);
    });

    this.coordinator.on('process_error', (error) => {
      this.emit('error', error);
    });

    this.coordinator.on('process_ready', () => {
      this.emit('server_ready');
    });
  }

  updateStats(progressData) {
    if (progressData) {
      this.stats.passed = progressData.successful || 0;
      this.stats.failed = progressData.failed || 0;
      this.stats.totalRequest = progressData.total || this.TOTAL_REQUEST;
    }
  }

  async pollResults() {
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const status = await this.coordinator.getStatus();
          
          if (status.completed) {
            clearInterval(pollInterval);
            
            // Get final results
            const results = await this.coordinator.getResults();
            this.mapResultsToStats(results);
            resolve(this.stats);
          } else {
            // Update stats with current progress
            this.updateStats(status);
          }
        } catch (error) {
          // Continue polling on error, but log it
          console.debug('Polling error:', error.message);
        }
      }, 1000); // Poll every second

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        reject(new Error('Test timeout after 5 minutes'));
      }, 300000);
    });
  }

  mapResultsToStats(results) {
    // Map Go results to original API format
    this.stats = {
      passed: results.successfulRequests || 0,
      failed: results.failedRequests || 0,
      totalRequest: results.totalRequests || 0,
      // Add additional metrics from Go engine
      duration: results.duration,
      requestsPerSecond: results.requestsPerSecond,
      percentiles: results.percentiles,
      statusCodes: results.statusCodes,
      errors: results.errors
    };
  }

  async cleanup() {
    await this.coordinator.cleanup();
  }

  async startTest() {
    try {
      // Setup event handlers
      this.setupCoordinatorHandlers();
      
      // Create test configuration
      const config = this.createTestConfig();
      
      // Start Go process
      await this.coordinator.startGoProcess(config);
      
      // Start the test
      await this.coordinator.startTest();
      
      // Poll for results
      const results = await this.pollResults();
      
      // Emit finished event to maintain API compatibility
      this.emit('finished', results);
      
      console.log('__________________________________________');
      console.log('               TEST COMPLETE              ');
      console.log(results);
      
      return results;
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      // Always cleanup
      await this.cleanup();
    }
  }

  // Additional methods for process coordination
  getWebServerUrl() {
    return this.coordinator.getWebServerUrl();
  }

  isProcessRunning() {
    return this.coordinator.isProcessRunning();
  }

  async stopTest() {
    return this.coordinator.stopTest();
  }

  // Legacy method for backward compatibility
  oneJob(index) {
    // This method is no longer used but kept for API compatibility
    console.warn('oneJob method is deprecated and no longer used with Go engine');
    return Promise.resolve();
  }
}

module.exports = HttpLoadTest;