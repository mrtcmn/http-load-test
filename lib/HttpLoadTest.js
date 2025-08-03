const EventEmitter = require('events');
const BinaryManager = require('../scripts/install-binary');
const ProcessCoordinator = require('./ProcessCoordinator');
const { CONFIG_PARAMS } = require('../constant');
const { ErrorHandler, ErrorCodes } = require('./ErrorHandler');

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
    this.errorHandler = new ErrorHandler();
    this.testStartTime = null;
    this.testEndTime = null;
    
    this.setupErrorHandling();
    
    // Parse configuration
    try {
      this.parseConfig(config);
    } catch (error) {
      // Emit error asynchronously to allow event listeners to be set up
      process.nextTick(() => {
        this.emit('error', error);
      });
    }
  }

  setupErrorHandling() {
    // Handle errors from binary manager
    this.binaryManager.errorHandler.on('error', (error) => {
      this.errorHandler.addToHistory(error);
      this.emit('binary_error', error);
    });

    // Handle errors from process coordinator
    this.coordinator.errorHandler.on('error', (error) => {
      this.errorHandler.addToHistory(error);
      this.emit('process_error', error);
    });

    // Handle our own errors
    this.errorHandler.on('error', (error) => {
      console.error(`HttpLoadTest Error [${error.code}]: ${error.getUserMessage()}`);
      if (process.env.DEBUG) {
        console.error('Error details:', error.toJSON());
        console.error('Troubleshooting steps:');
        error.getTroubleshootingSteps().forEach((step, index) => {
          console.error(`  ${index + 1}. ${step}`);
        });
      }
    });

    this.errorHandler.on('retry', ({ error, attempt, maxRetries }) => {
      console.warn(`Retrying operation (${attempt}/${maxRetries}): ${error.getUserMessage()}`);
      this.emit('retry', { error, attempt, maxRetries });
    });
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
    try {
      if (!_c || typeof _c !== 'object') {
        throw this.errorHandler.createConfigError(
          ErrorCodes.INVALID_CONFIG,
          'Configuration must be a valid object',
          null,
          { providedType: typeof _c }
        );
      }

      // Validate required URL parameter
      if (!_c[CONFIG_PARAMS.URL]) {
        throw this.errorHandler.createValidationError(
          ErrorCodes.MISSING_REQUIRED_PARAM,
          'URL parameter is required',
          null,
          { field: 'url' }
        );
      }

      // Parse configuration parameters with validation
      this.TOTAL_REQUEST = this.validateNumericParam(_c, CONFIG_PARAMS.TOTAL_REQUEST, 10, 1, 1000000);
      this.PER_SECOND_REQUEST = this.validateNumericParam(_c, CONFIG_PARAMS.PER_SECOND_REQUEST, 10, 1, 10000);
      this.CONCURRENT_REQUEST = this.validateNumericParam(_c, CONFIG_PARAMS.CONCURRENT_REQUEST, 1, 1, 1000);
      this.stats.totalRequest = this.TOTAL_REQUEST;

      // Axios configuration mapping with validation
      if (_c[CONFIG_PARAMS.URL]) {
        this.validateUrl(_c[CONFIG_PARAMS.URL]);
        this.prepareAxiosOptions('url', _c[CONFIG_PARAMS.URL]);
      }
      
      if (_c[CONFIG_PARAMS.METHOD]) {
        this.validateHttpMethod(_c[CONFIG_PARAMS.METHOD]);
        this.prepareAxiosOptions('method', _c[CONFIG_PARAMS.METHOD]);
      }
      
      if (_c[CONFIG_PARAMS.HEADERS]) {
        this.validateHeaders(_c[CONFIG_PARAMS.HEADERS]);
        this.prepareAxiosOptions('headers', _c[CONFIG_PARAMS.HEADERS]);
      }
      
      if (_c[CONFIG_PARAMS.DATA]) {
        this.prepareAxiosOptions('data', _c[CONFIG_PARAMS.DATA]);
      }

      // Handle additional axios configurations
      if (_c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS]) {
        if (typeof _c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS] !== 'object') {
          throw this.errorHandler.createValidationError(
            ErrorCodes.INVALID_CONFIG,
            'requestConfig must be a valid object',
            null,
            { field: 'requestConfig', type: typeof _c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS] }
          );
        }
        
        Object.keys(_c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS]).forEach((configKey) => {
          this.prepareAxiosOptions(configKey, _c[CONFIG_PARAMS.OTHER_AXIOS_REQUEST_CONFIGS][configKey]);
        });
      }

      // Success checker function validation
      if (_c[CONFIG_PARAMS.SUCCESS_CHECKER_FN]) {
        if (typeof _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN] !== 'function') {
          throw this.errorHandler.createValidationError(
            ErrorCodes.INVALID_FUNCTION,
            'Success checker must be a function',
            null,
            { field: 'successChecker', type: typeof _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN] }
          );
        }
        this.successChecker = _c[CONFIG_PARAMS.SUCCESS_CHECKER_FN];
      }

      console.log('Configuration parsed successfully');
    } catch (error) {
      if (error.code) {
        throw error; // Already a LoadTestError
      }
      
      throw this.errorHandler.createConfigError(
        ErrorCodes.INVALID_CONFIG,
        `Configuration parsing failed: ${error.message}`,
        error,
        { config: _c }
      );
    }
  }

  validateNumericParam(config, paramName, defaultValue, min, max) {
    const value = config[paramName];
    if (value === undefined) {
      return defaultValue;
    }
    
    const numValue = Number(value);
    if (isNaN(numValue) || numValue < min || numValue > max) {
      throw this.errorHandler.createValidationError(
        ErrorCodes.INVALID_CONFIG,
        `${paramName} must be a number between ${min} and ${max}`,
        null,
        { field: paramName, value, min, max }
      );
    }
    
    return numValue;
  }

  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL must use HTTP or HTTPS protocol');
      }
    } catch (error) {
      throw this.errorHandler.createValidationError(
        ErrorCodes.INVALID_URL,
        `Invalid URL: ${error.message}`,
        error,
        { url }
      );
    }
  }

  validateHttpMethod(method) {
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(method.toUpperCase())) {
      throw this.errorHandler.createValidationError(
        ErrorCodes.INVALID_METHOD,
        `Invalid HTTP method: ${method}. Valid methods: ${validMethods.join(', ')}`,
        null,
        { method, validMethods }
      );
    }
  }

  validateHeaders(headers) {
    if (typeof headers !== 'object' || headers === null) {
      throw this.errorHandler.createValidationError(
        ErrorCodes.INVALID_HEADERS,
        'Headers must be a valid object',
        null,
        { headers, type: typeof headers }
      );
    }
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
    this.testStartTime = Date.now();
    
    try {
      console.log('Starting HTTP load test...');
      
      // Setup event handlers
      this.setupCoordinatorHandlers();
      
      // Create test configuration
      const config = this.createTestConfig();
      console.log(`Test configuration: ${config.totalRequests} requests at ${config.requestsPerSecond} RPS with ${config.concurrentRequests} concurrent connections`);
      
      // Start Go process with retry logic
      await this.retryOperation(
        () => this.coordinator.startGoProcess(config),
        'start-go-process',
        3
      );
      
      // Start the test
      await this.coordinator.startTest();
      console.log('Load test started successfully');
      
      // Poll for results
      const results = await this.pollResults();
      
      this.testEndTime = Date.now();
      const totalTestTime = this.testEndTime - this.testStartTime;
      
      // Add test metadata to results
      results.testMetadata = {
        startTime: new Date(this.testStartTime).toISOString(),
        endTime: new Date(this.testEndTime).toISOString(),
        totalTestTime,
        configuration: config
      };
      
      // Emit finished event to maintain API compatibility
      this.emit('finished', results);
      
      console.log('__________________________________________');
      console.log('               TEST COMPLETE              ');
      console.log(`Total test time: ${totalTestTime}ms`);
      console.log(results);
      
      return results;
    } catch (error) {
      this.testEndTime = Date.now();
      
      // Categorize and handle the error
      const categorizedError = this.errorHandler.categorizeError(error, {
        operation: 'start_test',
        testDuration: this.testEndTime - this.testStartTime
      });
      
      this.errorHandler.addToHistory(categorizedError);
      
      console.error(`Test failed: ${categorizedError.getUserMessage()}`);
      if (process.env.DEBUG) {
        console.error('Troubleshooting steps:');
        categorizedError.getTroubleshootingSteps().forEach((step, index) => {
          console.error(`  ${index + 1}. ${step}`);
        });
      }
      
      this.emit('error', categorizedError);
      throw categorizedError;
    } finally {
      // Always cleanup
      try {
        await this.cleanup();
      } catch (cleanupError) {
        console.warn('Cleanup error:', cleanupError.message);
      }
    }
  }

  async retryOperation(operation, operationName, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        const categorizedError = this.errorHandler.categorizeError(error, {
          operation: operationName,
          attempt
        });

        if (attempt < maxRetries && categorizedError.recoverable) {
          console.warn(`${operationName} attempt ${attempt} failed, retrying...`);
          this.emit('retry', { error: categorizedError, attempt, maxRetries });
          
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        
        throw categorizedError;
      }
    }
    
    throw lastError;
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

  /**
   * Get comprehensive error statistics
   */
  getErrorStats() {
    return {
      httpLoadTest: this.errorHandler.getErrorStats(),
      binaryManager: this.binaryManager.getErrorStats(),
      processCoordinator: this.coordinator.getErrorStats()
    };
  }

  /**
   * Get system diagnostics
   */
  getDiagnostics() {
    return {
      testInfo: {
        startTime: this.testStartTime,
        endTime: this.testEndTime,
        duration: this.testEndTime && this.testStartTime ? this.testEndTime - this.testStartTime : null,
        isRunning: this.coordinator.isProcessRunning()
      },
      configuration: {
        totalRequests: this.TOTAL_REQUEST,
        requestsPerSecond: this.PER_SECOND_REQUEST,
        concurrentRequests: this.CONCURRENT_REQUEST,
        url: this.AXIOS_REQUEST_CONFIG.url,
        method: this.AXIOS_REQUEST_CONFIG.method
      },
      processCoordinator: this.coordinator.getDiagnostics(),
      errorStats: this.getErrorStats()
    };
  }

  /**
   * Clear all error history
   */
  clearErrors() {
    this.errorHandler.clearHistory();
    this.binaryManager.clearErrors();
    this.coordinator.clearErrors();
  }

  /**
   * Get health status of all components
   */
  getHealthStatus() {
    const binaryHealth = this.binaryManager.isBinaryHealthy();
    const processHealth = this.coordinator.getProcessHealth();
    
    return {
      overall: binaryHealth.healthy && processHealth.healthy,
      binary: binaryHealth,
      process: processHealth,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Create a user-friendly error report
   */
  generateErrorReport() {
    const diagnostics = this.getDiagnostics();
    const health = this.getHealthStatus();
    
    return {
      timestamp: new Date().toISOString(),
      health,
      diagnostics,
      recommendations: this.generateRecommendations(health, diagnostics)
    };
  }

  generateRecommendations(health, diagnostics) {
    const recommendations = [];
    
    if (!health.binary.healthy) {
      recommendations.push({
        category: 'Binary',
        issue: health.binary.reason,
        solution: 'Try running npm install to reinstall the binary, or ensure Go is installed for compilation from source'
      });
    }
    
    if (!health.process.healthy) {
      recommendations.push({
        category: 'Process',
        issue: health.process.reason,
        solution: 'Check system resources and ensure no firewall is blocking the application'
      });
    }
    
    const errorStats = diagnostics.errorStats;
    if (errorStats.httpLoadTest.total > 0) {
      const mostCommonError = Object.entries(errorStats.httpLoadTest.byCode)
        .sort(([,a], [,b]) => b - a)[0];
      
      if (mostCommonError) {
        recommendations.push({
          category: 'Errors',
          issue: `Most common error: ${mostCommonError[0]} (${mostCommonError[1]} occurrences)`,
          solution: 'Check the error details and troubleshooting steps in the debug output'
        });
      }
    }
    
    return recommendations;
  }
}

module.exports = HttpLoadTest;